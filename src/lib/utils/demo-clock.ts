/**
 * The demo clock (RA-31).
 *
 * `VirtualClock` existed and nothing referenced it, which meant the two most defensible
 * behaviours in the project could not be shown to anyone: the 8AM-7PM IST contact window, and
 * the T+1h / T+24h / T+72h retry ladder. Both play out over days; a demo lasts five minutes.
 *
 * Two rules keep this a demo aid rather than a way to fake results:
 *
 *   1. **Time only moves forward.** A backwards jump would re-open journeys whose scheduled
 *      attempts have already fired, so the same outreach could be replayed and counted twice.
 *      Returning to real time is done by reseeding, which deletes the rows that could replay.
 *   2. **Every advance is audited.** A `clock_advanced` row records who moved time, from when,
 *      to when, and by how much — so an evaluator reading the timeline can see exactly where
 *      time jumped and confirm that no stopping rule was skipped over rather than satisfied.
 */

import { Clock, SystemClock, VirtualClock, formatIST, getClock, setClock } from './time';
import { writeAuditLog } from './audit';

export interface ClockState {
  /** True once this process is running on a virtual clock. */
  isVirtual: boolean;
  /**
   * Offset from real time, in milliseconds. Negative when the demo is pinned to a date in the
   * past, which the seeded batch is — only the *advances* are constrained to be non-negative.
   */
  offsetMs: number;
  nowIso: string;
  realNowIso: string;
}

/** The clock this process is running on, promoted to a VirtualClock on first advance. */
function asVirtualClock(): VirtualClock {
  const current: Clock = getClock();
  if (current instanceof VirtualClock) return current;

  // A test that pinned a FixedClock keeps it: this module must never quietly replace a clock a
  // caller deliberately installed, or a deterministic test would start drifting.
  if (!(current instanceof SystemClock)) {
    throw new Error(
      '[demo-clock] Refusing to replace a clock installed by the caller. ' +
        'The demo clock only takes over from SystemClock.'
    );
  }

  const virtual = new VirtualClock(0);
  setClock(virtual);
  return virtual;
}

export function getClockState(): ClockState {
  const current = getClock();
  const isVirtual = current instanceof VirtualClock;
  return {
    isVirtual,
    offsetMs: isVirtual ? current.getOffset() : 0,
    nowIso: formatIST(current.now()),
    realNowIso: formatIST(new Date()),
  };
}

export interface AdvanceRequest {
  /** Move forward by this many minutes. */
  advanceMinutes?: number;
  /** Or move to this absolute instant, which must not be in the past of the current clock. */
  toIso?: string;
}

export interface AdvanceResult {
  fromIso: string;
  toIso: string;
  advancedMinutes: number;
  state: ClockState;
}

export class ClockDirectionError extends Error {}
export class ClockInputError extends Error {}

/**
 * Moves the demo clock forward and records it.
 *
 * Returns the interval that was skipped, so a caller can say what it jumped over rather than
 * only where it landed — the difference between "it is now 09:00" and "the twelve hours in
 * which outreach was deferred have elapsed".
 */
export async function advanceDemoClock(request: AdvanceRequest): Promise<AdvanceResult> {
  const { advanceMinutes, toIso } = request;

  if ((advanceMinutes === undefined) === (toIso === undefined)) {
    throw new ClockInputError('Provide exactly one of advanceMinutes or toIso.');
  }

  const clock = asVirtualClock();
  const from = clock.now();

  let deltaMs: number;
  if (advanceMinutes !== undefined) {
    if (!Number.isFinite(advanceMinutes)) {
      throw new ClockInputError('advanceMinutes must be a finite number.');
    }
    deltaMs = Math.round(advanceMinutes * 60 * 1000);
  } else {
    const target = new Date(toIso!);
    if (Number.isNaN(target.getTime())) {
      throw new ClockInputError(`Unparseable instant: "${toIso}".`);
    }
    deltaMs = target.getTime() - from.getTime();
  }

  if (deltaMs < 0) {
    throw new ClockDirectionError(
      `Time only moves forward. Requested ${Math.round(deltaMs / 60000)} minutes from ` +
        `${formatIST(from)}. Reseed the batch to return to real time.`
    );
  }

  clock.advanceBy(deltaMs);
  const to = clock.now();

  await writeAuditLog({
    journeyId: null, // a process-wide event; it belongs to no single journey
    actor: 'system',
    eventType: 'clock_advanced',
    eventData: {
      fromIso: formatIST(from),
      toIso: formatIST(to),
      advancedMinutes: Math.round(deltaMs / 60000),
      offsetMsAfter: clock.getOffset(),
      reason: 'demo_clock_advance',
      note: 'Simulated time only. Scheduled work is evaluated against this clock, never skipped.',
    },
  });

  return {
    fromIso: formatIST(from),
    toIso: formatIST(to),
    advancedMinutes: Math.round(deltaMs / 60000),
    state: getClockState(),
  };
}

/**
 * Returns the process to real time. Only safe alongside a reseed — see rule 1 above — so it is
 * called by the seed route rather than exposed as a control of its own.
 */
export function resetDemoClock(): void {
  if (getClock() instanceof VirtualClock) {
    setClock(new SystemClock());
  }
}
