import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } from '@/lib/db/schema';
import { eq, asc, and, gte, isNull, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ID', message: 'Customer ID is required' } },
        { status: 400 }
      );
    }

    // 1. Fetch customer
    const customerList = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    if (customerList.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } },
        { status: 404 }
      );
    }
    const customer = customerList[0];

    // 2. Fetch payment failures
    const failures = await db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.customerId, id));

    // 3. Fetch recovery journeys.
    //
    // The seeded batch gives every customer one journey per experiment arm, so an unqualified
    // `journeys[0]` picked whichever row the driver happened to return first — in practice arm A,
    // the no-outreach control. That is the one journey guaranteed to have no dispatches, no
    // escalation and no stopping rules, so the audit timeline for every customer rendered as the
    // emptiest version of itself. Order by arm descending and prefer C: the agent's own arm is the
    // one this page is about.
    const journeys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.customerId, id))
      .orderBy(desc(recoveryJourneys.arm));

    const journey = journeys[0] || null;

    // 4. Fetch actions & audit logs if journey exists
    let actions: typeof recoveryActions.$inferSelect[] = [];
    let logs: (typeof auditLogs.$inferSelect & { parsedData?: Record<string, unknown> })[] = [];

    if (journey) {
      actions = await db
        .select()
        .from(recoveryActions)
        .where(eq(recoveryActions.journeyId, journey.id))
        .orderBy(asc(recoveryActions.executedAt));

      const journeyLogs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.journeyId, journey.id))
        .orderBy(asc(auditLogs.createdAt));

      // Process-wide events carry a null journey id on purpose — advancing the demo clock belongs
      // to no single customer, and attaching it to one would put a false entry in their history.
      // The consequence was that `clock_advanced` rows were written and then visible nowhere, so
      // the audit trail could not evidence the one thing that makes contact-hours deferral
      // demonstrable: that time moved, when, and by how much. Merge them in, scoped to this
      // journey's lifetime so the timeline stays a record of this journey rather than the whole
      // deployment, and label them as system-wide in the UI.
      const systemLogs = await db
        .select()
        .from(auditLogs)
        .where(and(isNull(auditLogs.journeyId), gte(auditLogs.createdAt, journey.createdAt)))
        .orderBy(asc(auditLogs.createdAt));

      logs = [...journeyLogs, ...systemLogs]
        .sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
          // A clock advance and the work it unblocked share a timestamp, because the advance is
          // what made that instant current. Order the advance first so the timeline reads as
          // cause then effect rather than the reverse.
          const aSystem = a.journeyId === null ? 0 : 1;
          const bSystem = b.journeyId === null ? 0 : 1;
          return aSystem - bSystem;
        })
        .map((log) => {
          let parsed = {};
          try {
            parsed = JSON.parse(log.eventData);
          } catch {
            parsed = { raw: log.eventData };
          }
          return {
            ...log,
            parsedData: parsed,
          };
        });
    }

    return NextResponse.json({
      success: true,
      data: {
        customer,
        failures,
        journey,
        actions,
        auditLogs: logs,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error fetching customer details';
    console.error('[GET /api/customers/[id]]', error);
    return NextResponse.json(
      { success: false, error: { code: 'CUSTOMER_DETAIL_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
