import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, paymentFailures, recoveryJourneys } from '@/lib/db/schema';
import { and, desc, eq, inArray, or, sql, SQL } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  preferredLanguage: string;
  segment: string;
  dndStatus: string;
  journeyId: string | null;
  journeyStatus: string;
  strategy: string;
  amountAtRiskPaise: number;
  amountRecoveredPaise: number;
  currentAttempt: number;
  maxAttempts: number;
  currentChannel: string | null;
  failureType: string;
  errorReason: string;
  errorCode: string;
  errorDescription: string;
  paymentMethod: string;
  totalActionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status'); // 'resolved' | 'recovering' | 'exhausted' | 'opted_out' | 'all'
    const strategyFilter = searchParams.get('strategy');
    const channelFilter = searchParams.get('channel');
    const search = searchParams.get('search')?.toLowerCase().trim();
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? Math.max(1, Math.min(500, Number(limitParam) || 0)) : null;
    const offset = offsetParam ? Math.max(0, Number(offsetParam) || 0) : 0;

    // Customers and journeys are joined and filtered in SQL (using the
    // indexes added for this fix) rather than loaded whole and joined with
    // nested Array.find() in application memory (see RA-19). A payment
    // failure not yet linked to a journey (the state immediately after
    // seeding, before any recovery has started) is resolved separately
    // below via an indexed IN-list lookup instead of a join, so that case
    // isn't dropped while still avoiding a full-table scan.
    const conditions: SQL[] = [];

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'exceptions') {
        conditions.push(or(eq(recoveryJourneys.status, 'exhausted'), eq(recoveryJourneys.status, 'opted_out'))!);
      } else {
        conditions.push(eq(recoveryJourneys.status, statusFilter));
      }
    }

    if (strategyFilter && strategyFilter !== 'all') {
      conditions.push(eq(recoveryJourneys.strategy, strategyFilter));
    }

    if (channelFilter && channelFilter !== 'all') {
      conditions.push(eq(recoveryJourneys.currentChannel, channelFilter));
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          sql`lower(${customers.name}) LIKE ${pattern}`,
          sql`lower(${customers.email}) LIKE ${pattern}`,
          sql`lower(${customers.phone}) LIKE ${pattern}`,
          sql`lower(${paymentFailures.errorReason}) LIKE ${pattern}`,
          sql`lower(${customers.id}) LIKE ${pattern}`
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // recoveryActions count per journey is computed via an indexed
    // correlated subquery rather than loading every action row.
    const actionsCountExpr = sql<number>`(
      SELECT COUNT(*) FROM recovery_actions WHERE recovery_actions.journey_id = ${recoveryJourneys.id}
    )`;
    const sortKeyExpr = sql<string>`COALESCE(${recoveryJourneys.updatedAt}, ${customers.updatedAt})`;

    const baseQuery = db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        preferredLanguage: customers.preferredLanguage,
        segment: customers.segment,
        dndStatus: customers.dndStatus,
        journeyId: recoveryJourneys.id,
        journeyStatus: recoveryJourneys.status,
        strategy: recoveryJourneys.strategy,
        amountAtRisk: recoveryJourneys.amountAtRisk,
        amountRecovered: recoveryJourneys.amountRecovered,
        currentAttempt: recoveryJourneys.currentAttempt,
        maxAttempts: recoveryJourneys.maxAttempts,
        currentChannel: recoveryJourneys.currentChannel,
        journeyCreatedAt: recoveryJourneys.createdAt,
        journeyUpdatedAt: recoveryJourneys.updatedAt,
        failureAmount: paymentFailures.amount,
        failureType: paymentFailures.failureType,
        errorReason: paymentFailures.errorReason,
        errorCode: paymentFailures.errorCode,
        errorDescription: paymentFailures.errorDescription,
        paymentMethod: paymentFailures.paymentMethod,
        custCreatedAt: customers.createdAt,
        custUpdatedAt: customers.updatedAt,
        totalActionsCount: actionsCountExpr,
      })
      .from(customers)
      .leftJoin(recoveryJourneys, eq(recoveryJourneys.customerId, customers.id))
      .leftJoin(paymentFailures, eq(paymentFailures.id, recoveryJourneys.failureId))
      .where(whereClause)
      .orderBy(desc(sortKeyExpr));

    const rows = limit !== null ? await baseQuery.limit(limit).offset(offset) : await baseQuery;

    const [{ count: total }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customers)
      .leftJoin(recoveryJourneys, eq(recoveryJourneys.customerId, customers.id))
      .leftJoin(paymentFailures, eq(paymentFailures.id, recoveryJourneys.failureId))
      .where(whereClause);

    // Resolve a fallback failure for rows that have no journey yet, bounded
    // to just this page's customer ids (indexed IN-list, not a full scan).
    const customerIdsWithoutJourney = rows.filter((r) => !r.journeyId).map((r) => r.id);
    const fallbackFailureByCustomerId = new Map<string, (typeof paymentFailures.$inferSelect)>();
    if (customerIdsWithoutJourney.length > 0) {
      const fallbackFailures = await db
        .select()
        .from(paymentFailures)
        .where(inArray(paymentFailures.customerId, customerIdsWithoutJourney));
      for (const f of fallbackFailures) {
        if (!fallbackFailureByCustomerId.has(f.customerId)) {
          fallbackFailureByCustomerId.set(f.customerId, f);
        }
      }
    }

    const items: CustomerListItem[] = rows.map((row) => {
      const fallbackFailure = !row.journeyId ? fallbackFailureByCustomerId.get(row.id) : undefined;

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        preferredLanguage: row.preferredLanguage,
        segment: row.segment,
        dndStatus: row.dndStatus,
        journeyId: row.journeyId ?? null,
        journeyStatus: row.journeyStatus ?? 'no_journey',
        strategy: row.strategy ?? 'unassigned',
        amountAtRiskPaise: row.amountAtRisk ?? row.failureAmount ?? fallbackFailure?.amount ?? 0,
        amountRecoveredPaise: row.amountRecovered ?? 0,
        currentAttempt: row.currentAttempt ?? 0,
        maxAttempts: row.maxAttempts ?? 3,
        currentChannel: row.currentChannel ?? null,
        failureType: row.failureType ?? fallbackFailure?.failureType ?? 'one_time',
        errorReason: row.errorReason ?? fallbackFailure?.errorReason ?? 'unknown',
        errorCode: row.errorCode ?? fallbackFailure?.errorCode ?? 'BAD_REQUEST_ERROR',
        errorDescription: row.errorDescription ?? fallbackFailure?.errorDescription ?? 'No description',
        paymentMethod: row.paymentMethod ?? fallbackFailure?.paymentMethod ?? 'card',
        totalActionsCount: Number(row.totalActionsCount) || 0,
        createdAt: row.journeyCreatedAt ?? row.custCreatedAt,
        updatedAt: row.journeyUpdatedAt ?? row.custUpdatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        total,
        items,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error fetching customers';
    console.error('[GET /api/customers]', error);
    return NextResponse.json(
      { success: false, error: { code: 'CUSTOMERS_FETCH_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
