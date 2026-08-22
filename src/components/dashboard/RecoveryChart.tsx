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

interface RecoveryChartProps {
  failureMetrics: FailureTypeMetric[];
  baseline: {
    armA_noAgentPct: number;
    armB_rulesOnlyDunningPct: number;
    armC_recoverAiPct: number;
    netLiftPct: number;
  };
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

  // Baseline comparison data
  const armData = [
    { arm: 'Arm A (No Agent)', rate: baseline.armA_noAgentPct, fill: '#94a3b8' },
    { arm: 'Arm B (Rules Dunning)', rate: baseline.armB_rulesOnlyDunningPct, fill: '#64748b' },
    { arm: 'Arm C (RecoverAI)', rate: baseline.armC_recoverAiPct, fill: '#4f46e5' },
  ];

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
                Controlled benchmark comparison
              </CardDescription>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              +{baseline.netLiftPct}% Lift
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {armData.map((item, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-zinc-700 dark:text-zinc-300">{item.arm}</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-50">{item.rate}%</span>
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
              Defensible Proof (C − B):
            </div>
            <p>
              Arm B measures fixed-schedule dunning. RecoverAI generates dynamic channel failover
              and LLM-reasoned messaging, capturing an extra{' '}
              <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">
                +{baseline.netLiftPct}%
              </strong>{' '}
              in incremental revenue.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
