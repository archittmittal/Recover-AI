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
          name: 'WhatsApp Business API',
          escalationStep: 'Attempt 1 (Primary)',
          icon: MessageCircle,
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-50 dark:bg-emerald-950/30',
          border: 'border-emerald-200 dark:border-emerald-800/40',
          badge: '98% Open Rate',
          highlight: 'Fastest settlement via 1-click Razorpay Link',
        };
      case 'sms':
        return {
          name: 'TRAI DLT SMS',
          escalationStep: 'Attempt 2 (Escalation)',
          icon: MessageSquare,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-950/30',
          border: 'border-blue-200 dark:border-blue-800/40',
          badge: 'Service Implicit',
          highlight: 'Delivers across offline & feature phones',
        };
      case 'voice':
        return {
          name: 'AI Voice Call (Hinglish)',
          escalationStep: 'Attempt 3 (Final Urgent)',
          icon: PhoneCall,
          color: 'text-purple-600 dark:text-purple-400',
          bg: 'bg-purple-50 dark:bg-purple-950/30',
          border: 'border-purple-200 dark:border-purple-800/40',
          badge: 'Urgent Signal',
          highlight: 'Synthesizes Hindi/English conversational call',
        };
      default:
        return {
          name: 'Email / Invoices',
          escalationStep: 'B2B Escalation',
          icon: Mail,
          color: 'text-zinc-600 dark:text-zinc-400',
          bg: 'bg-zinc-50 dark:bg-zinc-900',
          border: 'border-zinc-200 dark:border-zinc-800',
          badge: 'Corporate Dunning',
          highlight: 'Itemized PDF reminder via Razorpay Invoices',
        };
    }
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Multi-Channel Escalation Ladder
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              WhatsApp (Attempt 1) → SMS (Attempt 2) → Voice Call (Attempt 3)
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-normal border-zinc-200">
            Stopping Rule: Hard cap at 3 attempts
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg ${info.bg}`}>
                        <Icon className={`w-4 h-4 ${info.color}`} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {info.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium">
                          {info.escalationStep}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-semibold py-0 px-1.5">
                      {info.badge}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-zinc-100 dark:border-zinc-800/80 text-center">
                    <div>
                      <div className="text-[10px] text-zinc-500 font-medium">Dispatched</div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {metric.totalAttempts}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 font-medium">Recoveries</div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {metric.recoveredCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 font-medium">Conversion</div>
                      <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {metric.conversionRatePct}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span className="truncate">{info.highlight}</span>
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
