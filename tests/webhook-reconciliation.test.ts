import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';

/**
 * #188 made the webhook handler acknowledge before doing the agent's work, which cost something
 * real: a failure after the response cannot be signalled to Razorpay, so their retry — the
 * mechanism RA-10's reclaim path depends on — can never fire for it.
 *
 * The failure is recorded faithfully in `webhook_events`, and until now nothing ever read those
 * rows. This sweep is what closes that loop, so these tests are about visibility rather than
 * repair: an event that died must be findable, and a healthy one must not raise a false alarm.
 */

const { db } = await import('../src/lib/db');
const { webhookEvents } = await import('../src/lib/db/schema');
const { findUnprocessedWebhookEvents } = await import('../src/lib/recovery/webhook-reconciliation');
const { setClock, FixedClock, SystemClock, formatIST } = await import('../src/lib/utils/time');

const NOW = '2026-08-21T14:30:00+05:30';
const minutesAgo = (n: number) =>
  formatIST(new Date(Date.parse(NOW) - n * 60 * 1000));

async function seedEvent(status: string, receivedAt: string, errorMessage: string | null = null) {
  const id = `evt_recon_${crypto.randomUUID()}`;
  await db.insert(webhookEvents).values({
    id,
    eventType: 'payment.failed',
    payloadHash: crypto.randomUUID(),
    processingStatus: status,
    errorMessage,
    receivedAt,
    processedAt: status === 'processed' ? receivedAt : null,
  });
  return id;
}

beforeEach(async () => {
  setClock(new FixedClock(NOW));
  await db.delete(webhookEvents);
});

afterAll(() => setClock(new SystemClock()));

describe('unprocessed webhook reconciliation', () => {
  it('finds an event whose deferred processing threw', async () => {
    const id = await seedEvent('failed', minutesAgo(2), 'RAZORPAY_KEY_ID is missing');

    const { failed, stuck } = await findUnprocessedWebhookEvents();

    expect(failed.map((e) => e.id)).toEqual([id]);
    expect(failed[0].errorMessage).toContain('RAZORPAY_KEY_ID');
    expect(stuck).toHaveLength(0);
  });

  /**
   * The invisible casualty: the invocation died between claiming the event and writing an
   * outcome — a serverless timeout, or a deploy landing mid-flight. No error was ever recorded,
   * so nothing but the elapsed time distinguishes it from work still in progress.
   */
  it('finds an event stuck in processing past the threshold', async () => {
    const id = await seedEvent('processing', minutesAgo(45));

    const { stuck } = await findUnprocessedWebhookEvents();

    expect(stuck.map((e) => e.id)).toEqual([id]);
  });

  it('leaves an event that is legitimately still in flight alone', async () => {
    await seedEvent('processing', minutesAgo(1));

    const { failed, stuck } = await findUnprocessedWebhookEvents();

    // Deferred processing takes seconds. A minute old is working, not broken — raising it would
    // train an operator to ignore the report.
    expect(failed).toHaveLength(0);
    expect(stuck).toHaveLength(0);
  });

  it('ignores events that completed', async () => {
    await seedEvent('processed', minutesAgo(60));

    const { failed, stuck } = await findUnprocessedWebhookEvents();

    expect(failed).toHaveLength(0);
    expect(stuck).toHaveLength(0);
  });

  it('honours a caller-supplied staleness threshold', async () => {
    await seedEvent('processing', minutesAgo(10));

    expect((await findUnprocessedWebhookEvents(15)).stuck).toHaveLength(0);
    expect((await findUnprocessedWebhookEvents(5)).stuck).toHaveLength(1);
  });
});
