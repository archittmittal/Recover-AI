'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { JourneyStatusBadge } from './JourneyStatusBadge';
import { ArmBadge } from './ArmBadge';
import { AuditTimeline, AuditLogEntry } from './AuditTimeline';
import {
  Search,
  MessageCircle,
  PhoneCall,
  MessageSquare,
  Mail,
  Eye,
  Terminal,
  Filter,
} from 'lucide-react';
import { CustomerListItem } from '@/app/api/customers/route';
import { formatPaise } from '@/lib/utils/money';

interface CustomerTableProps {
  customers: CustomerListItem[];
}

interface CustomerProfileDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferredLanguage: string;
  segment: string;
  dndStatus: string;
}

export function CustomerTable({ customers }: CustomerTableProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState<{
    customer: CustomerProfileDetail;
    auditLogs: AuditLogEntry[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Filter customers
  const filteredCustomers = customers.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      item.errorReason.toLowerCase().includes(search.toLowerCase()) ||
      item.id.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'active') {
      return item.journeyStatus === 'recovering' || item.journeyStatus === 'diagnosing' || item.journeyStatus === 'escalating';
    }
    if (activeTab === 'resolved') {
      return item.journeyStatus === 'resolved';
    }
    if (activeTab === 'exceptions') {
      return item.journeyStatus === 'exhausted' || item.journeyStatus === 'opted_out';
    }
    return true;
  });

  const handleOpenTimeline = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setSelectedCustomerData({
          customer: json.data.customer,
          auditLogs: json.data.auditLogs,
        });
      }
    } catch (err) {
      console.error('Error loading timeline:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const getChannelIcon = (channel: string | null) => {
    switch (channel) {
      case 'whatsapp':
        return <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 inline mr-1" />;
      case 'sms':
        return <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 inline mr-1" />;
      case 'voice':
        return <PhoneCall className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 inline mr-1" />;
      default:
        return <Mail className="w-3.5 h-3.5 text-zinc-500 inline mr-1" />;
    }
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Recovery records
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              One row per journey. Each customer is seeded into all three arms, so a name appears once per arm.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
              <Input
                placeholder="Search customer, error, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="pt-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 w-full sm:w-auto h-9">
              <TabsTrigger value="all" className="text-xs">
                All ({customers.length})
              </TabsTrigger>
              <TabsTrigger value="active" className="text-xs">
                Active (
                {
                  customers.filter(
                    (c) =>
                      c.journeyStatus === 'recovering' ||
                      c.journeyStatus === 'diagnosing' ||
                      c.journeyStatus === 'escalating'
                  ).length
                }
                )
              </TabsTrigger>
              <TabsTrigger value="resolved" className="text-xs text-emerald-700 dark:text-emerald-400">
                Recovered (
                {customers.filter((c) => c.journeyStatus === 'resolved').length}
                )
              </TabsTrigger>
              <TabsTrigger value="exceptions" className="text-xs text-rose-700 dark:text-rose-400 font-semibold">
                Exceptions (
                {
                  customers.filter(
                    (c) =>
                      c.journeyStatus === 'exhausted' || c.journeyStatus === 'opted_out'
                  ).length
                }
                )
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        {filteredCustomers.length === 0 ? (
          <div className="p-8 text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-800">
            <Filter className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
            <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No matching records
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              Adjust the search, or seed a new batch from the top bar.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold bg-zinc-50/50 dark:bg-zinc-900/50">
                  <th className="p-3 pl-4">Customer</th>
                  <th className="p-3">Payment Failure Reason</th>
                  <th className="p-3">Strategy & Channel</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">At Risk / Recovered</th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filteredCustomers.map((cust) => {
                  const atRiskLabel = formatPaise(cust.amountAtRiskPaise);
                  const recoveredLabel = formatPaise(cust.amountRecoveredPaise);

                  return (
                    <tr
                      key={cust.journeyId ?? cust.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="p-3 pl-4 align-top">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {cust.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono whitespace-nowrap">
                          {cust.phone} • {cust.preferredLanguage.toUpperCase()}
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-[9px] font-medium py-0 px-1 uppercase"
                          >
                            {cust.segment}
                          </Badge>
                          {cust.arm && <ArmBadge arm={cust.arm} />}
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <div className="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                          {cust.errorReason}
                        </div>
                        <div className="text-[11px] text-zinc-500 line-clamp-2 max-w-[220px]">
                          {cust.errorDescription}
                        </div>
                        <div className="text-[10px] text-zinc-400 capitalize mt-0.5">
                          Method: {cust.paymentMethod} • {cust.failureType}
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200">
                          {cust.strategy.replace(/_/g, ' ')}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center whitespace-nowrap">
                          {getChannelIcon(cust.currentChannel)}
                          <span className="capitalize">{cust.currentChannel || 'None'}</span>
                          <span className="ml-1 text-zinc-400 font-mono">
                            ({cust.currentAttempt}/{cust.maxAttempts})
                          </span>
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <JourneyStatusBadge status={cust.journeyStatus} />
                        {cust.dndStatus === 'opted_out' && (
                          <div className="text-[10px] text-zinc-500 mt-1">DND: Opted Out</div>
                        )}
                      </td>

                      <td className="p-3 align-top whitespace-nowrap">
                        <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {atRiskLabel}
                        </div>
                        <div
                          className={`text-[11px] font-mono font-medium ${
                            cust.amountRecoveredPaise > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-400'
                          }`}
                        >
                          Recovered: {recoveredLabel}
                        </div>
                      </td>

                      <td className="p-3 pr-4 text-right align-top whitespace-nowrap space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenTimeline(cust.id)}
                          className="h-7 text-xs border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1 text-zinc-600" />
                          Timeline
                        </Button>
                        <Link href={`/simulator?customerId=${cust.id}`}>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300"
                          >
                            <Terminal className="w-3.5 h-3.5 mr-1" />
                            Simulate
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Audit Timeline Modal */}
      <Dialog
        open={selectedCustomerId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCustomerId(null);
            setSelectedCustomerData(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>
                Audit trail —{' '}
                <span className="text-indigo-600 dark:text-indigo-400">
                  {selectedCustomerData?.customer?.name || 'Customer'}
                </span>
              </span>
              <span className="text-xs font-mono font-normal text-zinc-500">
                {selectedCustomerId}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Webhook receipts, diagnosis reasoning, dispatched messages and customer responses.
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetails ? (
            <div className="p-12 text-center text-xs text-zinc-500">Loading audit history...</div>
          ) : selectedCustomerData ? (
            <div className="mt-4">
              <AuditTimeline
                logs={selectedCustomerData.auditLogs}
                customerName={selectedCustomerData.customer?.name}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
