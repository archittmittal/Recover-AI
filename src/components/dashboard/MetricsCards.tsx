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
  avgRecoveryTimeMinutes: number;
}

export interface BaselineComparisonData {
  armA_noAgentPct: number;
  armB_rulesOnlyDunningPct: number;
  armC_recoverAiPct: number;
  netLiftPct: number;
}

interface MetricsCardsProps {
  summary: MetricsSummaryData;
  baseline: BaselineComparisonData;
}

export function MetricsCards({ summary, baseline }: MetricsCardsProps) {
  const formatRupees = (rupees: number) => {
    return `₹${rupees.toLocaleString('en-IN')}`;
  };

  const cards = [
    {
      title: 'Revenue at Risk',
      value: formatRupees(summary.totalAtRiskRupees),
      subtext: `Across ${summary.totalFailures} payment failures`,
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
      value: `+${baseline.netLiftPct}%`,
      subtext: `vs static rules baseline (${baseline.armB_rulesOnlyDunningPct}%)`,
      badge: 'Defensible',
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
      value: `${summary.avgRecoveryTimeMinutes}m`,
      subtext: 'Time-to-settlement post-failure',
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
