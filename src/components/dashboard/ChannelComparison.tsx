'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, PhoneCall, MessageCircle, Mail } from 'lucide-react';
import { ChannelMetric } from '@/app/api/metrics/route';

interface ChannelComparisonProps {
  channelMetrics: ChannelMetric[];
}

export function ChannelComparison({ channelMetrics }: ChannelComparisonProps) {
  const getChannelDetails = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return {
          name: 'WhatsApp',
          escalationStep: 'Attempt 1 · primary',
          icon: MessageCircle,
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-50 dark:bg-emerald-950/30',
          border: 'border-emerald-200 dark:border-emerald-800/40',
          badge: 'Attempt 1',
          highlight: 'Razorpay payment link',
        };
      case 'sms':
        return {
          name: 'SMS',
          escalationStep: 'Attempt 2 · escalation',
          icon: MessageSquare,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-950/30',
          border: 'border-blue-200 dark:border-blue-800/40',
          badge: 'Attempt 2',
          highlight: 'DLT template route',
        };
      case 'voice':
        return {
          name: 'Voice call',
          escalationStep: 'Attempt 3 · final',
          icon: PhoneCall,
          color: 'text-purple-600 dark:text-purple-400',
          bg: 'bg-purple-50 dark:bg-purple-950/30',
          border: 'border-purple-200 dark:border-purple-800/40',
          badge: 'Attempt 3',
          highlight: 'Hindi / English script',
        };
      default:
        return {
          name: 'Email',
          escalationStep: 'B2B route',
          icon: Mail,
          color: 'text-zinc-600 dark:text-zinc-400',
          bg: 'bg-zinc-50 dark:bg-zinc-900',
          border: 'border-zinc-200 dark:border-zinc-800',
          badge: 'B2B',
          highlight: 'Invoice reminder',
        };
    }
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Escalation ladder
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              WhatsApp → SMS → voice call
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-normal whitespace-nowrap shrink-0 border-zinc-200">
            Hard cap: 3 attempts
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {channelMetrics
            .filter((c) => c.channel !== 'email')
            .map((metric) => {
              const info = getChannelDetails(metric.channel);
              const Icon = info.icon;
              return (
                <div
                  key={metric.channel}
                  className={`p-4 rounded-xl border ${info.border} bg-white dark:bg-zinc-900/40 shadow-2xs flex flex-col justify-between space-y-3`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 shrink-0 rounded-lg ${info.bg}`}>
                        <Icon className={`w-4 h-4 ${info.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {info.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium truncate">
                          {info.escalationStep}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-semibold py-0 px-1.5 shrink-0">
                      {info.badge}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-1 py-2 border-y border-zinc-100 dark:border-zinc-800/80 text-center tabular-nums">
                    <div>
                      <div className="text-[10px] text-zinc-500 font-medium">Sent</div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {metric.totalAttempts}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 font-medium">Paid</div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {metric.recoveredCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 font-medium">Conv.</div>
                      <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {metric.conversionRatePct}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span className="truncate min-w-0">{info.highlight}</span>
                    <span className="font-mono text-zinc-700 dark:text-zinc-300 font-semibold shrink-0 ml-1">
                      ₹{metric.costEstimateRupees} cost
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
