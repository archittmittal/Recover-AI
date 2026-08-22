'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/navigation/Navbar';
import { JourneyStatusBadge } from '@/components/customers/JourneyStatusBadge';
import { AuditTimeline, AuditLogEntry } from '@/components/customers/AuditTimeline';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  User,
  CreditCard,
  ShieldCheck,
  Terminal,
  Loader2,
} from 'lucide-react';

interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  preferredLanguage: string;
  segment: string;
  dndStatus: string;
  totalFailures: number;
  totalRecoveredAmount: number;
  createdAt: string;
}

interface PaymentFailureDetail {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  failureType: string;
  errorCode: string;
  errorSource: string;
  errorStep: string;
  errorReason: string;
  errorDescription: string;
}

interface RecoveryJourneyDetail {
  id: string;
  status: string;
  strategy: string;
  amountAtRisk: number;
  amountRecovered: number;
  maxAttempts: number;
  currentAttempt: number;
  currentChannel: string | null;
  createdAt: string;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [data, setData] = useState<{
    customer: CustomerProfile;
    failures: PaymentFailureDetail[];
    journey: RecoveryJourneyDetail | null;
    actions: unknown[];
    auditLogs: AuditLogEntry[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadCustomer() {
      try {
        const res = await fetch(`/api/customers/${customerId}`);
        const json = await res.json();
        if (!isMounted) return;
        if (json.success) {
          setData(json.data);
        }
      } catch (err) {
        console.error('Error loading customer:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    if (customerId) {
      loadCustomer();
    }
    return () => {
      isMounted = false;
    };
  }, [customerId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="text-sm font-medium">Loading customer journey details...</span>
          </div>
        </main>
      </div>
    );
  }

  if (!data || !data.customer) {
    return (
      <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Customer Not Found</h2>
          <p className="text-xs text-zinc-500">The customer with ID {customerId} does not exist.</p>
          <Link href="/customers">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Customers
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const { customer, failures, journey, auditLogs } = data;
  const primaryFailure = failures[0];
  const atRiskRupees = ((journey?.amountAtRisk || primaryFailure?.amount || 0) / 100).toLocaleString('en-IN');
  const recoveredRupees = ((journey?.amountRecovered || 0) / 100).toLocaleString('en-IN');

  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Breadcrumb & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <Link href="/customers">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-zinc-600 hover:text-zinc-900">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                {customer.name}
                {journey && <JourneyStatusBadge status={journey.status} />}
              </h1>
              <p className="text-xs font-mono text-zinc-500">{customer.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/simulator?customerId=${customer.id}`}>
              <Button size="sm" className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                <Terminal className="w-3.5 h-3.5 mr-1.5" />
                Open in Customer Simulator
              </Button>
            </Link>
          </div>
        </div>

        {/* Top Row: Customer Profile & Journey Diagnostic */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Customer Profile Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-zinc-500" /> Customer Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Phone</span>
                <span className="font-mono font-medium">{customer.phone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Email</span>
                <span className="font-mono font-medium truncate max-w-[160px]">{customer.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Preferred Language</span>
                <span className="font-medium uppercase">{customer.preferredLanguage}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Customer Segment</span>
                <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
                  {customer.segment}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-500">DND Status</span>
                <Badge
                  variant="outline"
                  className={
                    customer.dndStatus === 'active'
                      ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                      : 'border-zinc-300 text-zinc-700 bg-zinc-100'
                  }
                >
                  {customer.dndStatus === 'active' ? 'Active Outreach' : 'Opted Out (DND)'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Payment Failure Diagnostic Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-zinc-500" /> Failure Root Cause
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Amount At Risk</span>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  ₹{atRiskRupees}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Error Reason</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {primaryFailure?.errorReason || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Error Source & Step</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400">
                  {primaryFailure?.errorSource} / {primaryFailure?.errorStep}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Payment Method</span>
                <span className="capitalize">{primaryFailure?.paymentMethod || 'card'}</span>
              </div>
              <div className="py-1 text-zinc-500 text-[11px]">
                <strong>Description:</strong> {primaryFailure?.errorDescription || 'No description'}
              </div>
            </CardContent>
          </Card>

          {/* Recovery State Machine Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-zinc-500" /> Recovery Journey
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Assigned Strategy</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {journey?.strategy?.replace(/_/g, ' ') || 'Unassigned'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Attempt Progress</span>
                <span className="font-mono font-medium">
                  {journey?.currentAttempt || 0} / {journey?.maxAttempts || 3} attempts
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Current Channel</span>
                <span className="capitalize font-medium">{journey?.currentChannel || 'None'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-zinc-500">Amount Recovered</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ₹{recoveredRupees}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-500">Created At</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-400 text-[11px]">
                  {journey?.createdAt || customer.createdAt}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Section: Full Immutable Audit Timeline */}
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Immutable Recovery Audit Ledger
            </CardTitle>
            <CardContent className="px-0 pt-3">
              <AuditTimeline logs={auditLogs} customerName={customer.name} />
            </CardContent>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
