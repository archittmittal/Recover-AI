'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { FailureTypeMetric } from '@/app/api/metrics/route';
import { BaselineComparisonData } from '@/components/dashboard/MetricsCards';

interface RecoveryChartProps {
  failureMetrics: FailureTypeMetric[];
  baseline: BaselineComparisonData;
}

export function RecoveryChart({ failureMetrics, baseline }: RecoveryChartProps) {
  // Chart data: Rupee values across failure categories
  const categoryData = failureMetrics.map((item) => ({
    name: item.displayName.split(' ')[0], // short label
    fullName: item.displayName,
    atRisk: Math.round(item.atRiskPaise / 100),
    recovered: Math.round(item.recoveredPaise / 100),
    rate: item.recoveryRatePct,
  }));

  // Baseline comparison data, measured per arm rather than declared (RA-22).
  const armFill: Record<'A' | 'B' | 'C', string> = {
    A: '#94a3b8',
    B: '#64748b',
    C: '#4f46e5',
  };
  const armData = baseline.arms.map((item) => ({
    arm: item.label,
    description: item.description,
    rate: item.recoveryRatePct,
    n: item.journeyCount,
    fill: armFill[item.arm],
  }));
  const armB = baseline.arms.find((a) => a.arm === 'B');
  const armC = baseline.arms.find((a) => a.arm === 'C');
  const signedLift = `${baseline.netLiftPct >= 0 ? '+' : ''}${baseline.netLiftPct}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Category Breakdown (2 columns) */}
      <Card className="lg:col-span-2 border-zinc-200 dark:border-zinc-800 shadow-xs">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Revenue Recovery by Payment Scenario
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Amount At-Risk (₹) vs Successfully Recovered (₹)
              </CardDescription>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              50+ Synthetic Batch
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${val / 1000}k` : val}`}
                />
                <Tooltip
                  formatter={(val: unknown, name: unknown) => [
                    `₹${typeof val === 'number' ? val.toLocaleString('en-IN') : String(val)}`,
                    name === 'atRisk' ? 'At Risk' : 'Recovered',
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    fontSize: '12px',
                    borderColor: '#cbd5e1',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="atRisk" name="At Risk (₹)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recovered" name="Recovered (₹)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 3-Arm Scientific Baseline Evaluation (1 column) */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Evaluation Arms (A / B / C)
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Same seeded failures in every arm
              </CardDescription>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                !baseline.isMeasurable
                  ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  : baseline.netLiftPct >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              {baseline.isMeasurable ? `${signedLift} pts C − B` : 'Not yet run'}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {armData.map((item, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-zinc-700 dark:text-zinc-300" title={item.description}>
                  {item.arm}
                </span>
                <span className="font-bold text-zinc-900 dark:text-zinc-50">
                  {item.rate}% <span className="font-normal text-zinc-400">n={item.n}</span>
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(item.rate, 100)}%`, backgroundColor: item.fill }}
                />
              </div>
            </div>
          ))}

          <div className="mt-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-900 dark:text-zinc-200">
              The honest headline (C − B):
            </div>
            {baseline.isMeasurable ? (
              <p>
                Arm B is what a cron job and one template would have achieved on its own (
                {armB?.recoveryRatePct ?? 0}%). Arm C adds classification, per-failure strategy,
                personalised copy and channel escalation ({armC?.recoveryRatePct ?? 0}%). Only the
                difference —{' '}
                <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">
                  {signedLift} pts
                </strong>{' '}
                — is attributable to the agent&apos;s judgment. All three arms run the same seeded
                failures with the same random draws, so the comparison is not a matter of which
                arm got luckier.
              </p>
            ) : (
              <p>
                No comparison yet: at least one arm has no journeys. Run the batch, then all three
                rates are computed from their own cohorts.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
