'use client';

import React from 'react';
import { CustomerListItem } from '@/app/api/customers/route';
import { JourneyStatusBadge } from '@/components/customers/JourneyStatusBadge';
import { ChevronRight, UserX } from 'lucide-react';

interface CustomerSelectorProps {
  customers: CustomerListItem[];
  selectedCustomerId: string | null;
  onSelectCustomer: (customerId: string) => void;
}

export function CustomerSelector({
  customers,
  selectedCustomerId,
  onSelectCustomer,
}: CustomerSelectorProps) {
  if (customers.length === 0) {
    return (
      <div className="py-8 px-4 text-center space-y-2 text-zinc-500">
        <UserX className="w-6 h-6 mx-auto text-zinc-400" />
        <div className="text-xs font-medium">No matching customers found</div>
        <p className="text-[11px] text-zinc-400">
          Try adjusting your search query or seed a new synthetic batch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
      {customers.map((cust) => {
        const isSelected = cust.id === selectedCustomerId;
        const atRiskRupees = (cust.amountAtRiskPaise / 100).toLocaleString('en-IN');

        return (
          <button
            type="button"
            key={cust.id}
            onClick={() => onSelectCustomer(cust.id)}
            className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isSelected
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-xs ring-1 ring-indigo-600'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                {cust.name.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {cust.name}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono truncate">
                  ₹{atRiskRupees} • {cust.errorReason}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <JourneyStatusBadge status={cust.journeyStatus} showIcon={false} className="text-[10px] py-0 px-1.5" />
              <ChevronRight
                className={`w-4 h-4 ${
                  isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'
                }`}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
