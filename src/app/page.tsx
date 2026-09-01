'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navigation/Navbar';
import { MetricsCards, MetricsSummaryData, BaselineComparisonData } from '@/components/dashboard/MetricsCards';
import { RecoveryChart } from '@/components/dashboard/RecoveryChart';
import { ChannelComparison } from '@/components/dashboard/ChannelComparison';
import { FailureBreakdown } from '@/components/dashboard/FailureBreakdown';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  RotateCcw,
  RefreshCw,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import { ChannelMetric, FailureTypeMetric, StrategyMetric } from './api/metrics/route';
import { CustomerListItem } from './api/customers/route';

export default function DashboardPage() {
  const [summary, setSummary] = useState<MetricsSummaryData | null>(null);
  const [baseline, setBaseline] = useState<BaselineComparisonData | null>(null);
  const [channelMetrics, setChannelMetrics] = useState<ChannelMetric[]>([]);
  const [failureMetrics, setFailureMetrics] = useState<FailureTypeMetric[]>([]);
  const [strategyMetrics, setStrategyMetrics] = useState<StrategyMetric[]>([]);
  const [customersList, setCustomersList] = useState<CustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const loadData = async () => {
    try {
      const [metricsRes, customersRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/customers'),
      ]);

      const metricsJson = await metricsRes.json();
      const customersJson = await customersRes.json();

      if (metricsJson.success && metricsJson.data) {
        setSummary(metricsJson.data.summary);
        setBaseline(metricsJson.data.baselineComparison);
        setChannelMetrics(metricsJson.data.channelMetrics || []);
        setFailureMetrics(metricsJson.data.failureTypeMetrics || []);
        setStrategyMetrics(metricsJson.data.strategyMetrics || []);
      }

      if (customersJson.success && customersJson.data) {
        setCustomersList(customersJson.data.items || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [metricsRes, customersRes] = await Promise.all([
          fetch('/api/metrics'),
          fetch('/api/customers'),
        ]);

        const metricsJson = await metricsRes.json();
        const customersJson = await customersRes.json();

        if (!isMounted) return;

        if (metricsJson.success && metricsJson.data) {
          setSummary(metricsJson.data.summary);
          setBaseline(metricsJson.data.baselineComparison);
          setChannelMetrics(metricsJson.data.channelMetrics || []);
          setFailureMetrics(metricsJson.data.failureTypeMetrics || []);
          setStrategyMetrics(metricsJson.data.strategyMetrics || []);
        }

        if (customersJson.success && customersJson.data) {
          setCustomersList(customersJson.data.items || []);
        }
      } catch (err) {
        console.error('Initial dashboard fetch error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleInitialSeed = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/simulator/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        await loadData();
      }
    } catch (err) {
      console.error('Initial seed error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Executive Revenue Recovery Command Center
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Razorpay autonomous dunning, multi-channel failover, and RBI contact-hours
              compliance monitoring, over a synthetic batch.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="text-xs font-medium border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Analytics
            </Button>
          </div>
        </div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : !summary || summary.totalFailures === 0 ? (
          /* Empty state: No records in DB */
          <div className="max-w-md mx-auto my-12 text-center space-y-5 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Welcome to RecoverAI
              </h2>
              <p className="text-xs text-zinc-500">
                Autonomous Revenue Recovery Agent for Razorpay Buildathon 2026. Seed synthetic
                payment failures to observe the agent in action.
              </p>
            </div>

            <Button
              onClick={handleInitialSeed}
              disabled={isSeeding}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              {isSeeding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating 50+ Synthetic Failures...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Seed 50+ Failures Batch
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            {/*
              Every figure below is a simulation output, and the dashboard says so in the one
              place a judge reads first. Before RA-23 the only route to a recovery was a human
              clicking "Pay" in the simulator, so the recovery rate was a count of button
              presses presented as a measured result.
            */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
              <FlaskConical className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">Simulated figures.</span> Outcomes are drawn from
                the declared response model in{' '}
                <code className="font-mono text-[11px]">docs/SIMULATION_MODEL.md</code> over a
                synthetic batch, using a fixed seed. These are simulation outputs against that
                model — not recovered rupees.
              </p>
            </div>

            {/* 1. KPI Summary Cards */}
            {baseline && <MetricsCards summary={summary} baseline={baseline} />}

            {/* 2. Main Recovery Breakdown & 3-Arm Baseline Comparison */}
            {baseline && (
              <RecoveryChart failureMetrics={failureMetrics} baseline={baseline} />
            )}

            {/* 3. Multi-Channel Escalation Matrix & Strategy Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChannelComparison channelMetrics={channelMetrics} />
              <FailureBreakdown strategyMetrics={strategyMetrics} />
            </div>

            {/* 4. Active Customer Ledger & Exception Management */}
            <div className="pt-2">
              <CustomerTable customers={customersList} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
