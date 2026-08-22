'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { StrategyMetric } from '@/app/api/metrics/route';

interface FailureBreakdownProps {
  strategyMetrics: StrategyMetric[];
}

const STRATEGY_COLORS: Record<string, string> = {
  smart_retry: '#3b82f6', // blue
  payment_link: '#10b981', // emerald
  conversational: '#8b5cf6', // purple
  invoice_reminder: '#f59e0b', // amber
  merchant_alert: '#ef4444', // red
};

export function FailureBreakdown({ strategyMetrics }: FailureBreakdownProps) {
  const chartData = strategyMetrics.map((item) => ({
    name: item.displayName,
    rawKey: item.strategy,
    value: item.count,
    rate: item.recoveryRatePct,
    recoveredPaise: item.recoveredPaise,
    color: STRATEGY_COLORS[item.strategy] || '#64748b',
  }));

  const totalCount = strategyMetrics.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Recovery Strategy Distribution
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Deterministic routing & LLM root-cause classification
            </CardDescription>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {totalCount} Total Journeys
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Donut Chart */}
          <div className="h-[200px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: unknown, name: unknown) => [
                    `${typeof val === 'number' ? val : String(val)} journeys`,
                    typeof name === 'string' ? name : String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    fontSize: '12px',
                    borderColor: '#cbd5e1',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Strategy Legend & Rates */}
          <div className="space-y-2.5">
            {chartData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium truncate max-w-[160px]">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500">{item.value} txns</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[36px] text-right">
                    {item.rate}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
