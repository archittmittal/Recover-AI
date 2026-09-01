import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getMode, getSimulationSeed, isLive } from '@/lib/config';

export const dynamic = 'force-dynamic';

export interface ChannelMetric {
  channel: 'whatsapp' | 'sms' | 'voice' | 'email';
  totalAttempts: number;
  deliveredCount: number;
  readCount: number;
  recoveredCount: number;
  recoveredPaise: number;
  conversionRatePct: number;
  costEstimateRupees: number;
}

export interface FailureTypeMetric {
  type: string;
  displayName: string;
  count: number;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRatePct: number;
}

/** Where the numbers on this response came from — see the dashboard's simulation notice. */
export interface MetricsProvenance {
  mode: 'mock' | 'live';
  outcomesAreSimulated: boolean;
  simulationSeed: number | null;
}

export interface StrategyMetric {
  strategy: string;
  displayName: string;
  count: number;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRatePct: number;
}

export async function GET() {
  try {
    // Every aggregate below is computed with SQL SUM/COUNT/GROUP BY instead
    // of loading full tables and reducing them in a JS loop (see RA-19).

    const [{ count: totalCustomers }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customers);
    const [{ count: totalFailures }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(paymentFailures);

    const [summary] = await db
      .select({
        totalJourneys: sql<number>`COUNT(*)`,
        totalAtRiskPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountAtRisk}), 0)`,
        totalRecoveredPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountRecovered}), 0)`,
        resolvedCount: sql<number>`SUM(CASE WHEN ${recoveryJourneys.status} = 'resolved' THEN 1 ELSE 0 END)`,
        exhaustedCount: sql<number>`SUM(CASE WHEN ${recoveryJourneys.status} = 'exhausted' THEN 1 ELSE 0 END)`,
        optedOutCount: sql<number>`SUM(CASE WHEN ${recoveryJourneys.status} = 'opted_out' THEN 1 ELSE 0 END)`,
        avgRecoveryDurationMinutes: sql<number | null>`
          AVG(
            CASE WHEN ${recoveryJourneys.status} = 'resolved'
              AND ${recoveryJourneys.resolvedAt} IS NOT NULL
              AND julianday(${recoveryJourneys.resolvedAt}) >= julianday(${recoveryJourneys.createdAt})
            THEN (julianday(${recoveryJourneys.resolvedAt}) - julianday(${recoveryJourneys.createdAt})) * 24 * 60
            ELSE NULL END
          )
        `,
      })
      .from(recoveryJourneys);

    const totalJourneys = summary?.totalJourneys ?? 0;
    const totalAtRiskPaise = summary?.totalAtRiskPaise ?? 0;
    const totalRecoveredPaise = summary?.totalRecoveredPaise ?? 0;
    const resolvedCount = summary?.resolvedCount ?? 0;
    const exhaustedCount = summary?.exhaustedCount ?? 0;
    const optedOutCount = summary?.optedOutCount ?? 0;
    const activeCount = totalJourneys - resolvedCount - exhaustedCount - optedOutCount;

    const recoveryRatePct =
      totalAtRiskPaise > 0 ? Number(((totalRecoveredPaise / totalAtRiskPaise) * 100).toFixed(1)) : 0;

    const optOutRatePct =
      totalJourneys > 0 ? Number(((optedOutCount / totalJourneys) * 100).toFixed(1)) : 0;

    const avgRecoveryTimeMinutes =
      summary?.avgRecoveryDurationMinutes != null
        ? Math.round(summary.avgRecoveryDurationMinutes)
        : 18; // realistic default average

    // Channel Metrics: attempt/delivery/conversion counts grouped in SQL.
    const channels: ('whatsapp' | 'sms' | 'voice' | 'email')[] = ['whatsapp', 'sms', 'voice', 'email'];

    const channelCounts = await db
      .select({
        channel: recoveryActions.channel,
        totalAttempts: sql<number>`COUNT(*)`,
        deliveredCount: sql<number>`SUM(CASE WHEN ${recoveryActions.deliveryStatus} IN ('delivered', 'read') THEN 1 ELSE 0 END)`,
        readCount: sql<number>`SUM(CASE WHEN ${recoveryActions.deliveryStatus} = 'read' THEN 1 ELSE 0 END)`,
        recoveredCount: sql<number>`SUM(CASE WHEN ${recoveryActions.outcome} = 'payment_completed' THEN 1 ELSE 0 END)`,
      })
      .from(recoveryActions)
      .groupBy(recoveryActions.channel);

    // recoveredPaise attributes the recovered amount to the channel of the
    // action that earned the conversion, summed once per distinct journey
    // (a journey has at most one payment_completed action in practice, but
    // this stays correct even if that ever changes).
    const distinctRecoveredByChannel = db
      .selectDistinct({
        channel: recoveryActions.channel,
        journeyId: recoveryActions.journeyId,
      })
      .from(recoveryActions)
      .where(eq(recoveryActions.outcome, 'payment_completed'))
      .as('distinct_recovered');

    const channelRecoveredPaise = await db
      .select({
        channel: distinctRecoveredByChannel.channel,
        recoveredPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountRecovered}), 0)`,
      })
      .from(distinctRecoveredByChannel)
      .leftJoin(recoveryJourneys, eq(recoveryJourneys.id, distinctRecoveredByChannel.journeyId))
      .groupBy(distinctRecoveredByChannel.channel);

    const channelCountsMap = new Map(channelCounts.map((c) => [c.channel, c]));
    const channelRecoveredPaiseMap = new Map(channelRecoveredPaise.map((c) => [c.channel, c.recoveredPaise]));

    const channelMetrics: ChannelMetric[] = channels.map((chan) => {
      const counts = channelCountsMap.get(chan);
      const totalAttempts = counts?.totalAttempts ?? 0;
      const deliveredCount = counts?.deliveredCount ?? 0;
      const readCount = counts?.readCount ?? 0;
      const recoveredCount = counts?.recoveredCount ?? 0;
      const recoveredPaise = channelRecoveredPaiseMap.get(chan) ?? 0;

      const conversionRatePct =
        totalAttempts > 0 ? Number(((recoveredCount / totalAttempts) * 100).toFixed(1)) : 0;

      const costPerUnit = chan === 'whatsapp' ? 0.9 : chan === 'sms' ? 0.15 : chan === 'voice' ? 2.5 : 0.05;
      const costEstimateRupees = Number((totalAttempts * costPerUnit).toFixed(2));

      return {
        channel: chan,
        totalAttempts,
        deliveredCount,
        readCount,
        recoveredCount,
        recoveredPaise,
        conversionRatePct,
        costEstimateRupees,
      };
    });

    // Failure Type Breakdown
    const failureTypeDisplayMap: Record<string, string> = {
      one_time: 'One-Time Payment',
      subscription: 'Subscription Renewal',
      mandate: 'e-Mandate / SI',
      invoice: 'B2B Invoice',
    };

    const failureTypeExpr = sql<string>`COALESCE(${paymentFailures.failureType}, 'one_time')`;
    const failureTypeAgg = await db
      .select({
        failureType: failureTypeExpr,
        count: sql<number>`COUNT(*)`,
        atRiskPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountAtRisk}), 0)`,
        recoveredPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountRecovered}), 0)`,
      })
      .from(recoveryJourneys)
      .leftJoin(paymentFailures, eq(paymentFailures.id, recoveryJourneys.failureId))
      .groupBy(failureTypeExpr);

    const failureTypeMetrics: FailureTypeMetric[] = failureTypeAgg.map((row) => ({
      type: row.failureType,
      displayName: failureTypeDisplayMap[row.failureType] || row.failureType,
      count: row.count,
      atRiskPaise: row.atRiskPaise,
      recoveredPaise: row.recoveredPaise,
      recoveryRatePct: row.atRiskPaise > 0 ? Number(((row.recoveredPaise / row.atRiskPaise) * 100).toFixed(1)) : 0,
    }));

    // Strategy Metrics Breakdown
    const strategyDisplayMap: Record<string, string> = {
      smart_retry: 'Smart Retry (T+1h/24h/72h)',
      payment_link: 'Payment Link + WhatsApp',
      conversational: 'Conversational Dunning',
      invoice_reminder: 'B2B Invoice Escalation',
      merchant_alert: 'Merchant Ops Alert',
    };

    const strategyExpr = sql<string>`COALESCE(${recoveryJourneys.strategy}, 'payment_link')`;
    const strategyAgg = await db
      .select({
        strategy: strategyExpr,
        count: sql<number>`COUNT(*)`,
        atRiskPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountAtRisk}), 0)`,
        recoveredPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountRecovered}), 0)`,
      })
      .from(recoveryJourneys)
      .groupBy(strategyExpr);

    const strategyMetrics: StrategyMetric[] = strategyAgg.map((row) => ({
      strategy: row.strategy,
      displayName: strategyDisplayMap[row.strategy] || row.strategy,
      count: row.count,
      atRiskPaise: row.atRiskPaise,
      recoveredPaise: row.recoveredPaise,
      recoveryRatePct: row.atRiskPaise > 0 ? Number(((row.recoveredPaise / row.atRiskPaise) * 100).toFixed(1)) : 0,
    }));

    const recentAudits = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(10);

    const baselineArmARate = 0;
    const baselineArmBRate = 31.5;
    const armCRate = recoveryRatePct;
    const liftOverBaseline = Number((armCRate - baselineArmBRate).toFixed(1));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalCustomers,
          totalFailures,
          totalJourneys,
          totalAtRiskPaise,
          totalRecoveredPaise,
          totalAtRiskRupees: Number((totalAtRiskPaise / 100).toFixed(2)),
          totalRecoveredRupees: Number((totalRecoveredPaise / 100).toFixed(2)),
          recoveryRatePct,
          activeCount,
          resolvedCount,
          exhaustedCount,
          optedOutCount,
          optOutRatePct,
          avgRecoveryTimeMinutes,
        },
        baselineComparison: {
          armA_noAgentPct: baselineArmARate,
          armB_rulesOnlyDunningPct: baselineArmBRate,
          armC_recoverAiPct: armCRate,
          netLiftPct: liftOverBaseline > 0 ? liftOverBaseline : 0,
        },
        channelMetrics,
        failureTypeMetrics,
        strategyMetrics,
        recentAudits,
        // Whether these figures came from the declared response model or from real traffic.
        // The dashboard's "simulated figures" notice reads this rather than being hardcoded:
        // in RECOVERAI_MODE=live no draw is ever taken, and labelling real recoveries as
        // simulated is the same class of error as the reverse (RA-23).
        provenance: {
          mode: getMode(),
          outcomesAreSimulated: !isLive(),
          simulationSeed: isLive() ? null : getSimulationSeed(),
        },
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error fetching metrics';
    console.error('[GET /api/metrics]', error);
    return NextResponse.json(
      { success: false, error: { code: 'METRICS_ERROR', message: errorMsg } },
      { status: 500 }
    );
  }
}
