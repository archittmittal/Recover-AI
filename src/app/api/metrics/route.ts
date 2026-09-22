import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, paymentFailures, recoveryJourneys, recoveryActions, auditLogs } from '@/lib/db/schema';
import { desc, eq, ne, sql } from 'drizzle-orm';
import { getMode, getSimulationSeed, shouldSimulateOutcomes } from '@/lib/config';

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

/** One experiment arm's measured result (RA-22). Every field is computed from that arm's rows. */
export interface ArmMetric {
  arm: 'A' | 'B' | 'C';
  label: string;
  description: string;
  journeyCount: number;
  resolvedCount: number;
  atRiskPaise: number;
  recoveredPaise: number;
  /** Rupee-weighted: SUM(recovered)/SUM(at_risk). The headline, and the noisier of the two. */
  recoveryRatePct: number;
  /**
   * Journey-weighted: resolved/total. Reported alongside because the batch is heavy-tailed —
   * ten B2B invoices of up to ₹75,000 dominate the rupee figure, and across seeds the
   * amount-weighted rate varies about twice as much as the count-weighted one. A comparison
   * quoted only in the noisier metric invites reading a swing as a result.
   */
  recoveryRateByCountPct: number;
}

export interface BaselineComparison {
  arms: ArmMetric[];
  /** Arm C − Arm B, in percentage points. Negative when the agent underperformed the baseline. */
  netLiftPct: number;
  /** True once every arm has journeys; until then the comparison is not yet meaningful. */
  isMeasurable: boolean;
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
      .from(recoveryJourneys)
      // The headline is the product's arm. Arms A and B exist to be compared against, not to be
      // averaged into the number the product reports about itself; blending them would drag
      // every KPI toward a control that deliberately does less.
      .where(eq(recoveryJourneys.arm, 'C'));

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

    // Null when nothing has been recovered yet, rather than the 18-minute "realistic default
    // average" that used to stand here. A plausible-looking number with no run behind it is the
    // same defect as the hardcoded baseline this endpoint just stopped reporting (RA-22).
    const avgRecoveryTimeMinutes =
      summary?.avgRecoveryDurationMinutes != null
        ? Math.round(summary.avgRecoveryDurationMinutes)
        : null;

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

    // Three-arm comparison (RA-22). Every rate below is SUM(recovered)/SUM(at_risk) over that
    // arm's own journeys — the same expression the headline uses — so no numeric literal stands
    // in for a measurement. Arm A's rate is 0 because it never contacts anyone, not because a
    // zero was typed here; if a journey in arm A ever recovered, this would report it.
    //
    // Restricted to the seeded experiment cohorts. A failure ingested from a live webhook is
    // stamped arm 'C' so the agent treats it normally and the dashboard counts it — but it has no
    // counterpart in arms A and B, so letting it into the comparison destroys the one property
    // the arms are built on: identical data. Observed on the deployment, where seven injected
    // webhooks had grown arm C to 57 against 50 apiece, each new one dragging C's rate down and
    // understating the agent. Seeded rows carry a `simulation_key`; ingested rows do not.
    const armAgg = await db
      .select({
        arm: recoveryJourneys.arm,
        journeyCount: sql<number>`COUNT(*)`,
        resolvedCount: sql<number>`SUM(CASE WHEN ${recoveryJourneys.status} = 'resolved' THEN 1 ELSE 0 END)`,
        atRiskPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountAtRisk}), 0)`,
        recoveredPaise: sql<number>`COALESCE(SUM(${recoveryJourneys.amountRecovered}), 0)`,
      })
      .from(recoveryJourneys)
      .innerJoin(paymentFailures, eq(recoveryJourneys.failureId, paymentFailures.id))
      .where(ne(paymentFailures.simulationKey, ''))
      .groupBy(recoveryJourneys.arm);

    const armDefinitions: { arm: 'A' | 'B' | 'C'; label: string; description: string }[] = [
      { arm: 'A', label: 'A · No agent', description: 'Detected and recorded; never contacted.' },
      { arm: 'B', label: 'B · Rules-only dunning', description: 'Fixed cadence, one template, no LLM.' },
      { arm: 'C', label: 'C · RecoverAI', description: 'Classification, per-failure strategy, personalised copy, escalation.' },
    ];

    const arms: ArmMetric[] = armDefinitions.map((definition) => {
      const row = armAgg.find((a) => a.arm === definition.arm);
      const atRiskPaise = row?.atRiskPaise ?? 0;
      const recoveredPaise = row?.recoveredPaise ?? 0;
      const journeyCount = row?.journeyCount ?? 0;
      const resolvedCount = row?.resolvedCount ?? 0;
      return {
        ...definition,
        journeyCount,
        resolvedCount,
        atRiskPaise,
        recoveredPaise,
        recoveryRatePct:
          atRiskPaise > 0 ? Number(((recoveredPaise / atRiskPaise) * 100).toFixed(1)) : 0,
        recoveryRateByCountPct:
          journeyCount > 0 ? Number(((resolvedCount / journeyCount) * 100).toFixed(1)) : 0,
      };
    });

    const armB = arms.find((a) => a.arm === 'B');
    const armC = arms.find((a) => a.arm === 'C');
    const isMeasurable = arms.every((a) => a.journeyCount > 0);
    // Reported signed. If the agent lands below the baseline, that is the result, and clamping
    // it to zero would be picking the framing after the fact — the thing the arms exist to stop.
    const netLiftPct = Number(
      ((armC?.recoveryRatePct ?? 0) - (armB?.recoveryRatePct ?? 0)).toFixed(1)
    );

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
          arms,
          netLiftPct,
          isMeasurable,
        } satisfies BaselineComparison,
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
          // Reports what is actually true rather than inferring it from the mode: a live
          // deployment with SIMULATE_OUTCOMES=true still produces simulated recoveries, and the
          // dashboard must keep saying so.
          outcomesAreSimulated: shouldSimulateOutcomes(),
          simulationSeed: shouldSimulateOutcomes() ? getSimulationSeed() : null,
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
