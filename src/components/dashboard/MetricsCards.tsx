'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  IndianRupee,
  TrendingUp,
  ShieldCheck,
  Zap,
  Clock,
  Activity,
} from 'lucide-react';

export interface MetricsSummaryData {
  totalCustomers: number;
  totalFailures: number;
  totalJourneys: number;
  totalAtRiskPaise: number;
  totalRecoveredPaise: number;
  totalAtRiskRupees: number;
  totalRecoveredRupees: number;
  recoveryRatePct: number;
  activeCount: number;
  resolvedCount: number;
  exhaustedCount: number;
  optedOutCount: number;
  optOutRatePct: number;
  /** Null until something has actually been recovered — never a plausible-looking default. */
  avgRecoveryTimeMinutes: number | null;
}

export interface ArmMetricData {
  arm: 'A' | 'B' | 'C';
  label: string;
  description: string;
  journeyCount: number;
  resolvedCount: number;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRatePct: number;
  recoveryRateByCountPct: number;
}

export interface BaselineComparisonData {
  arms: ArmMetricData[];
  netLiftPct: number;
  isMeasurable: boolean;
}

interface MetricsCardsProps {
  summary: MetricsSummaryData;
  baseline: BaselineComparisonData;
}

export function MetricsCards({ summary, baseline }: MetricsCardsProps) {
  const formatRupees = (rupees: number) => {
    return `₹${rupees.toLocaleString('en-IN')}`;
  };

  const armB = baseline.arms.find((a) => a.arm === 'B');
  const armC = baseline.arms.find((a) => a.arm === 'C');

  const cards = [
    {
      title: 'Revenue at Risk',
      value: formatRupees(summary.totalAtRiskRupees),
      // Arm C's own cohort. The batch seeds the same failures into all three arms, so quoting
      // the whole table here would triple the figure the product is reporting about itself.
      subtext: `Arm C cohort · ${summary.totalJourneys} journeys`,
      icon: IndianRupee,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      border: 'border-rose-100 dark:border-rose-900/30',
    },
    {
      title: 'Recovered Revenue',
      value: formatRupees(summary.totalRecoveredRupees),
      badge: `${summary.recoveryRatePct}% Rate`,
      subtext: `${summary.resolvedCount} successful recoveries`,
      icon: TrendingUp,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      border: 'border-emerald-100 dark:border-emerald-900/30',
    },
    {
      title: 'Net AI Lift (Arm C − B)',
      // Signed, and blank until every arm has run. A lift card that always shows a positive
      // number is not reporting a measurement (RA-22).
      value: baseline.isMeasurable
        ? `${baseline.netLiftPct >= 0 ? '+' : ''}${baseline.netLiftPct} pts`
        : '—',
      subtext: baseline.isMeasurable
        ? `Arm C ${armC?.recoveryRatePct ?? 0}% vs Arm B ${armB?.recoveryRatePct ?? 0}% (n=${armB?.journeyCount ?? 0} per arm)`
        : 'Run the batch to measure all three arms',
      badge: baseline.isMeasurable ? 'Measured' : 'Not yet run',
      icon: Zap,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
      border: 'border-indigo-100 dark:border-indigo-900/30',
    },
    {
      title: 'Active Journeys',
      value: summary.activeCount.toString(),
      subtext: `${summary.exhaustedCount} exhausted (3-attempt cap)`,
      badge: 'In Progress',
      icon: Activity,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-100 dark:border-blue-900/30',
    },
    {
      title: 'Avg Recovery Time',
      value: summary.avgRecoveryTimeMinutes != null ? `${summary.avgRecoveryTimeMinutes}m` : '—',
      subtext:
        summary.avgRecoveryTimeMinutes != null
          ? 'Time-to-settlement post-failure'
          : 'No recoveries yet',
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-100 dark:border-amber-900/30',
    },
    {
      title: 'Opt-Out Rate (Stopping Rule)',
      value: `${summary.optOutRatePct}%`,
      subtext: `${summary.optedOutCount} stopped via 'STOP' / DND`,
      badge: 'Target <5%',
      icon: ShieldCheck,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      border: 'border-purple-100 dark:border-purple-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card
            key={idx}
            className={`border ${card.border} shadow-xs hover:shadow-md transition-shadow`}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate">
                  {card.title}
                </span>
                <div className={`p-1.5 rounded-lg ${card.bg}`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {card.value}
                </span>
                {card.badge && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {card.badge}
                  </span>
                )}
              </div>

              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-1">
                {card.subtext}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
