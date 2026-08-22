'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navigation/Navbar';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { CustomerListItem } from '../api/customers/route';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      const json = await res.json();
      if (json.success && json.data) {
        setCustomers(json.data.items || []);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch('/api/customers');
        const json = await res.json();
        if (!isMounted) return;
        if (json.success && json.data) {
          setCustomers(json.data.items || []);
        }
      } catch (err) {
        console.error('Error fetching customers:', err);
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
    loadCustomers();
  };

  return (
    <div className="min-h-screen bg-zinc-50/60 dark:bg-zinc-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Customer Recovery Directory & Audit Ledger
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Comprehensive list of all customers, active journeys, communication logs, and honest exception records.
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
              Refresh
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card className="border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-8 w-64 rounded-md" />
            </div>
            <div className="space-y-3 pt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </Card>
        ) : (
          <CustomerTable customers={customers} />
        )}
      </main>
    </div>
  );
}
