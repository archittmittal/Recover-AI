import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

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

    // 3. Fetch recovery journeys
    const journeys = await db
      .select()
      .from(recoveryJourneys)
      .where(eq(recoveryJourneys.customerId, id));

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

      const rawLogs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.journeyId, journey.id))
        .orderBy(asc(auditLogs.createdAt));

      logs = rawLogs.map((log) => {
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
