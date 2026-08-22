'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navigation/Navbar';
import { BatchControls } from '@/components/simulator/BatchControls';
import { CustomerSelector } from '@/components/simulator/CustomerSelector';
import {
  CustomerSimulator,
  SimCustomer,
  SimJourney,
  SimAction,
} from '@/components/simulator/CustomerSimulator';
import { AuditLogEntry } from '@/components/customers/AuditTimeline';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import type { CustomerListItem } from '../api/customers/route';

interface CustomerDetailResponse {
  customer: SimCustomer;
  failures: unknown[];
  journey: SimJourney | null;
  actions: SimAction[];
  auditLogs: AuditLogEntry[];
}

function SimulatorContent() {
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get('customerId');

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId);
  const [selectedCustomerData, setSelectedCustomerData] = useState<CustomerDetailResponse | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load specific selected customer details & journey
  const loadCustomerDetails = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSelectedCustomerData(json.data);
      }
    } catch (err) {
      console.error('Error loading customer details:', err);
    }
  }, []);

  // Load customer list
  const loadCustomers = useCallback(
    async (targetId?: string) => {
      try {
        const res = await fetch('/api/customers');
        const json = await res.json();
        if (json.success && json.data) {
          const items: CustomerListItem[] = json.data.items || [];
          setCustomers(items);

          const idToSelect = targetId || selectedCustomerId || (items.length > 0 ? items[0].id : null);
          if (idToSelect) {
            setSelectedCustomerId(idToSelect);
            await loadCustomerDetails(idToSelect);
          }
        }
      } catch (err) {
        console.error('Error loading customers for simulator:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedCustomerId, loadCustomerDetails]
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!isMounted) return;
      await loadCustomers(initialCustomerId || undefined);
    })();

    return () => {
      isMounted = false;
    };
  }, [initialCustomerId, loadCustomers]);

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    loadCustomerDetails(id);
  };

  const handleActionComplete = async () => {
    setIsRefreshing(true);
    await loadCustomers();
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.errorReason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              RecoverAI Interactive Simulation Sandbox
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live interactive testing environment. Evaluate compliance escalation, stopping rules
              (STOP/Payment), and AI conversational responses.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleActionComplete}
              disabled={isRefreshing}
              className="text-xs font-medium border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="text-sm font-medium">Initializing simulation sandbox...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (5 cols): Batch Controls & Customer List */}
            <div className="lg:col-span-5 space-y-6">
              {/* Batch & Webhook Controls */}
              <BatchControls onActionComplete={handleActionComplete} />

              {/* Customer Selector Card */}
              <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold">Select Customer to Simulate</CardTitle>
                    <span className="text-xs font-mono text-zinc-500">{filteredCustomers.length} total</span>
                  </div>
                  <div className="relative mt-2">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                    <Input
                      placeholder="Filter by customer name, phone, error..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <CustomerSelector
                    customers={filteredCustomers}
                    selectedCustomerId={selectedCustomerId}
                    onSelectCustomer={handleSelectCustomer}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Column (7 cols): Interactive Customer Simulator Chat Sandbox */}
            <div className="lg:col-span-7">
              <CustomerSimulator
                customer={selectedCustomerData?.customer}
                journey={selectedCustomerData?.journey}
                actions={selectedCustomerData?.actions || []}
                onRefresh={handleActionComplete}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}
