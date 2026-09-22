import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * RA-31 — `VirtualClock` was defined and referenced by nothing, so the two behaviours the task
 * board called critical-path — the 8AM-7PM IST contact window and the T+1h/T+24h/T+72h retry
 * ladder — could not be shown to anyone. Both play out over days; a demo lasts five minutes.
 *
 * The test that matters is the last one: outreach deferred at 21:00 IST actually dispatches
 * once time is advanced to the morning, through the same stopping rules, with no rule skipped.
 */

const { db } = await import('../src/lib/db');
const { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } = await import(
  '../src/lib/db/schema'
);
const { recoveryCoordinator } = await import('../src/lib/recovery/coordinator');
const { getClock, setClock, SystemClock, VirtualClock, FixedClock, formatIST } = await import(
  '../src/lib/utils/time'
);
const { advanceDemoClock, getClockState, resetDemoClock, ClockDirectionError, ClockInputError } =
  await import('../src/lib/utils/demo-clock');
const { POST: clockRoute, GET: clockStateRoute } = await import(
  '../src/app/api/simulator/clock/route'
);
const { POST: triggerRecovery } = await import('../src/app/api/recovery/trigger/route');

/** Real time, moved to a known wall-clock instant by offsetting rather than freezing. */
function startOnVirtualClockAt(iso: string) {
  setClock(new SystemClock());
  resetDemoClock();
  const virtual = new VirtualClock(Date.parse(iso) - Date.now());
  setClock(virtual);
  return virtual;
}

async function seedJourney(): Promise<string> {
  const suffix = crypto.randomUUID();
  const customerId = `cust_clock_${suffix}`;
  const failureId = `fail_clock_${suffix}`;
  const nowStr = formatIST(getClock().now());

  await db.insert(customers).values({
    id: customerId,
    name: 'Clock Fixture',
    email: `clock-${suffix}@example.com`,
    phone: '+919876500777',
    preferredLanguage: 'en',
    segment: 'b2c',
    totalFailures: 1,
    totalRecoveredAmount: 0,
    dndStatus: 'active',
    createdAt: nowStr,
    updatedAt: nowStr,
  });

  await db.insert(paymentFailures).values({
    id: failureId,
    customerId,
    razorpayPaymentId: `pay_${suffix}`,
    razorpayOrderId: `order_${suffix}`,
    amount: 149900,
    currency: 'INR',
    paymentMethod: 'card',
    failureType: 'one_time',
    errorCode: 'BAD_REQUEST_ERROR',
    errorSource: 'customer',
    errorStep: 'authorization',
    errorReason: 'insufficient_funds',
    errorDescription: 'Clock fixture failure.',
    arm: 'C',
    simulationKey: `sim_clock_${suffix}`,
    createdAt: nowStr,
  });

  return recoveryCoordinator.startRecoveryJourney(failureId);
}

afterAll(() => {
  setClock(new SystemClock());
});

describe('RA-31 demo clock', () => {
  beforeEach(async () => {
    startOnVirtualClockAt('2026-08-21T14:30:00+05:30');
    // Audit rows are stamped with the simulated clock, so rows written by an earlier case can
    // sort *after* this one's. Each case starts from an empty clock_advanced trail instead of
    // ordering by a timestamp the test itself moves.
    await db.delete(auditLogs).where(eq(auditLogs.eventType, 'clock_advanced'));
  });

  it('advances by a relative interval and reports what it skipped', async () => {
    const before = getClockState();
    const result = await advanceDemoClock({ advanceMinutes: 90 });

    expect(result.advancedMinutes).toBe(90);
    expect(result.fromIso).toBe(before.nowIso);
    expect(Date.parse(result.state.nowIso) - Date.parse(before.nowIso)).toBe(90 * 60 * 1000);
    // Offset, not frozen: real time keeps running underneath, so timestamps still order. The
    // offset itself is negative here because the seeded batch is dated in the past — only the
    // advances are constrained to be forward.
    expect(result.state.isVirtual).toBe(true);
    expect(result.state.offsetMs).toBe(before.offsetMs + 90 * 60 * 1000);
  });

  it('advances to an absolute instant', async () => {
    const result = await advanceDemoClock({ toIso: '2026-08-21T21:00:00+05:30' });
    expect(result.state.nowIso.startsWith('2026-08-21T21:00')).toBe(true);
    expect(result.advancedMinutes).toBe(390);
  });

  it('refuses to move backwards', async () => {
    await advanceDemoClock({ advanceMinutes: 60 });

    await expect(advanceDemoClock({ advanceMinutes: -30 })).rejects.toBeInstanceOf(
      ClockDirectionError
    );
    await expect(
      advanceDemoClock({ toIso: '2026-08-21T09:00:00+05:30' })
    ).rejects.toBeInstanceOf(ClockDirectionError);

    // Rewinding past a fired attempt would let the same outreach replay and be counted twice,
    // so the clock stays where it was.
    expect(getClockState().nowIso.startsWith('2026-08-21T15:30')).toBe(true);
  });

  it('rejects an ambiguous or unparseable request', async () => {
    await expect(advanceDemoClock({})).rejects.toBeInstanceOf(ClockInputError);
    await expect(
      advanceDemoClock({ advanceMinutes: 10, toIso: '2026-08-21T21:00:00+05:30' })
    ).rejects.toBeInstanceOf(ClockInputError);
    await expect(advanceDemoClock({ toIso: 'not-a-date' })).rejects.toBeInstanceOf(ClockInputError);
  });

  it('records every advance in the audit trail', async () => {
    await advanceDemoClock({ advanceMinutes: 45 });

    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.eventType, 'clock_advanced'));

    expect(rows).toHaveLength(1);
    const [row] = rows;
    // A process-wide event belongs to no journey; attaching it to one would put a false entry
    // in that customer's timeline.
    expect(row.journeyId).toBeNull();
    expect(row.actor).toBe('system');

    const data = JSON.parse(row.eventData);
    expect(data.advancedMinutes).toBe(45);
    expect(data.fromIso).toBeDefined();
    expect(data.toIso).toBeDefined();
  });

  it('will not displace a clock the caller installed deliberately', async () => {
    setClock(new FixedClock('2026-08-21T14:30:00+05:30'));
    // A test that pinned a FixedClock must keep it, or deterministic suites would start
    // drifting the moment something touched the demo controls.
    await expect(advanceDemoClock({ advanceMinutes: 10 })).rejects.toThrow(/Refusing to replace/);
  });

  it('resumes outreach deferred outside contact hours once time is advanced', async () => {
    // 21:00 IST: past the 19:00 cutoff, so the agent must defer rather than dispatch.
    startOnVirtualClockAt('2026-08-21T21:00:00+05:30');
    const journeyId = await seedJourney();

    const deferredActions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));
    expect(deferredActions).toHaveLength(0);

    const deferralLog = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.journeyId, journeyId));
    expect(
      deferralLog.some(
        (row) => row.eventType === 'stopping_rule_triggered' && row.eventData.includes('contact_hours')
      )
    ).toBe(true);

    // Advance across the boundary into the next morning.
    await advanceDemoClock({ toIso: '2026-08-22T09:00:00+05:30' });
    await recoveryCoordinator.processRecoveryAttempt(journeyId);

    const resumedActions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));

    // The rule was satisfied, not skipped: the attempt fires only because the clock now reads
    // a time inside the window, and it is stamped with that time.
    expect(resumedActions).toHaveLength(1);
    expect(resumedActions[0].executedAt.startsWith('2026-08-22T09:00')).toBe(true);

    const [journey] = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.id, journeyId));
    expect(journey.currentAttempt).toBe(1);
  });
});

describe('RA-31 clock route', () => {
  const post = (body: unknown) =>
    clockRoute(new Request('http://localhost/api/simulator/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never);

  beforeEach(() => {
    startOnVirtualClockAt('2026-08-21T14:30:00+05:30');
  });

  it('answers with the current simulated time', async () => {
    const json = await (await clockStateRoute()).json();
    expect(json.success).toBe(true);
    expect(json.data.nowIso.startsWith('2026-08-21T14:30')).toBe(true);
  });

  it('rejects a backwards jump with 409 and a bad request with 400', async () => {
    const backwards = await post({ toIso: '2026-08-20T09:00:00+05:30' });
    expect(backwards.status).toBe(409);
    expect((await backwards.json()).error.code).toBe('CLOCK_BACKWARDS');

    const ambiguous = await post({});
    expect(ambiguous.status).toBe(400);
    expect((await ambiguous.json()).error.code).toBe('INVALID_INPUT');
  });

  /**
   * The one that would have failed before this change: the route and the coordinator are
   * separate route modules, so a module-scoped clock would have handed each of them its own
   * copy — the simulator would advance a clock the agent never reads. The singleton lives on
   * globalThis for exactly this reason.
   */
  it('changes what the agent does, through the routes the demo actually clicks', async () => {
    await post({ toIso: '2026-08-21T21:00:00+05:30' });
    const journeyId = await seedJourney();

    let actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(0); // 21:00 IST — outside the contact window

    const advanced = await post({ toIso: '2026-08-22T09:00:00+05:30' });
    expect(advanced.status).toBe(200);

    await triggerRecovery();

    actions = await db
      .select()
      .from(recoveryActions)
      .where(eq(recoveryActions.journeyId, journeyId));
    expect(actions).toHaveLength(1);
    expect(actions[0].executedAt.startsWith('2026-08-22T09:00')).toBe(true);
  });
});
