import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, paymentFailures, recoveryJourneys, recoveryActions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export interface CustomerListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
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

    const allCustomers = await db.select().from(customers);
    const allFailures = await db.select().from(paymentFailures);
    const allJourneys = await db.select().from(recoveryJourneys);
    const allActions = await db.select().from(recoveryActions);

    let items: CustomerListItem[] = allCustomers.map((cust) => {
      const journey = allJourneys.find((j) => j.customerId === cust.id);
      const failure = journey ? allFailures.find((f) => f.id === journey.failureId) : allFailures.find((f) => f.customerId === cust.id);
      const actions = journey ? allActions.filter((a) => a.journeyId === journey.id) : [];

      return {
        id: cust.id,
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        preferredLanguage: cust.preferredLanguage,
        segment: cust.segment,
        dndStatus: cust.dndStatus,
        journeyId: journey?.id || null,
        journeyStatus: journey?.status || 'no_journey',
        strategy: journey?.strategy || 'unassigned',
        amountAtRiskPaise: journey?.amountAtRisk || failure?.amount || 0,
        amountRecoveredPaise: journey?.amountRecovered || 0,
        currentAttempt: journey?.currentAttempt || 0,
        maxAttempts: journey?.maxAttempts || 3,
        currentChannel: journey?.currentChannel || null,
        failureType: failure?.failureType || 'one_time',
        errorReason: failure?.errorReason || 'unknown',
        errorCode: failure?.errorCode || 'BAD_REQUEST_ERROR',
        errorDescription: failure?.errorDescription || 'No description',
        paymentMethod: failure?.paymentMethod || 'card',
        totalActionsCount: actions.length,
        createdAt: journey?.createdAt || cust.createdAt,
        updatedAt: journey?.updatedAt || cust.updatedAt,
      };
    });

    // Apply Search
    if (search) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          (item.email ?? '').toLowerCase().includes(search) ||
          (item.phone ?? '').toLowerCase().includes(search) ||
          item.errorReason.toLowerCase().includes(search) ||
          item.id.toLowerCase().includes(search)
      );
    }

    // Apply Status Filter
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'exceptions') {
        items = items.filter((item) => item.journeyStatus === 'exhausted' || item.journeyStatus === 'opted_out');
      } else {
        items = items.filter((item) => item.journeyStatus === statusFilter);
      }
    }

    // Apply Strategy Filter
    if (strategyFilter && strategyFilter !== 'all') {
      items = items.filter((item) => item.strategy === strategyFilter);
    }

    // Apply Channel Filter
    if (channelFilter && channelFilter !== 'all') {
      items = items.filter((item) => item.currentChannel === channelFilter);
    }

    // Sort by most recently updated
    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({
      success: true,
      data: {
        total: items.length,
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
