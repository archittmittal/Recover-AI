'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Webhook,
  Sparkles,
  Send,
  MessageSquare,
  CheckCircle2,
  Ban,
  Clock,
  ChevronDown,
  ChevronUp,
  Cpu,
  User,
  Shield,
} from 'lucide-react';

export interface AuditLogEntry {
  id: string;
  journeyId: string;
  actionId?: string | null;
  actor: 'system' | 'agent' | 'customer' | 'razorpay';
  eventType: string;
  eventData: string;
  createdAt: string;
  parsedData?: Record<string, unknown>;
}

interface AuditTimelineProps {
  logs: AuditLogEntry[];
  customerName?: string;
}

export function AuditTimeline({ logs, customerName = 'Customer' }: AuditTimelineProps) {
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedLogs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getEventVisuals = (eventType: string) => {
    switch (eventType) {
      case 'journey_created':
      case 'failure_detected':
      case 'webhook_received':
        return {
          icon: Webhook,
          title: 'Webhook Ingested & Failure Recorded',
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-50 dark:bg-amber-950/40',
          border: 'border-amber-200 dark:border-amber-800',
        };
      case 'failure_classified':
      case 'llm_diagnosis':
        return {
          icon: Sparkles,
          title: 'AI Root-Cause Diagnosis & Strategy Selected',
          color: 'text-indigo-600 dark:text-indigo-400',
          bg: 'bg-indigo-50 dark:bg-indigo-950/40',
          border: 'border-indigo-200 dark:border-indigo-800',
        };
      case 'recovery_action_executed':
      case 'message_dispatched':
      case 'whatsapp_message_dispatched':
      case 'sms_dispatched':
      case 'voice_call_dispatched':
        return {
          icon: Send,
          title: 'Multi-Channel Recovery Outreach Dispatched',
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-50 dark:bg-blue-950/40',
          border: 'border-blue-200 dark:border-blue-800',
        };
      case 'customer_response_received':
      case 'customer_interaction':
        return {
          icon: MessageSquare,
          title: 'Customer Replied in Simulator',
          color: 'text-sky-600 dark:text-sky-400',
          bg: 'bg-sky-50 dark:bg-sky-950/40',
          border: 'border-sky-200 dark:border-sky-800',
        };
      case 'stopping_rule_triggered':
      case 'customer_opted_out':
        return {
          icon: Ban,
          title: 'Stopping Rule Enforced (Outreach Halted)',
          color: 'text-rose-600 dark:text-rose-400',
          bg: 'bg-rose-50 dark:bg-rose-950/40',
          border: 'border-rose-200 dark:border-rose-800',
        };
      case 'journey_resolved':
      case 'payment_recovered':
        return {
          icon: CheckCircle2,
          title: 'Revenue Successfully Recovered (Resolved)',
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
          border: 'border-emerald-200 dark:border-emerald-800',
        };
      default:
        return {
          icon: Clock,
          title: eventType.replace(/_/g, ' '),
          color: 'text-zinc-600 dark:text-zinc-400',
          bg: 'bg-zinc-50 dark:bg-zinc-900',
          border: 'border-zinc-200 dark:border-zinc-800',
        };
    }
  };

  const getActorBadge = (actor: string) => {
    switch (actor) {
      case 'agent':
        return (
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 gap-1 text-[10px]">
            <Cpu className="w-3 h-3" /> RecoverAI Agent
          </Badge>
        );
      case 'customer':
        return (
          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 gap-1 text-[10px]">
            <User className="w-3 h-3" /> Customer ({customerName.split(' ')[0]})
          </Badge>
        );
      case 'razorpay':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 gap-1 text-[10px]">
            <Webhook className="w-3 h-3" /> Razorpay Test API
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 gap-1 text-[10px]">
            <Shield className="w-3 h-3" /> System Engine
          </Badge>
        );
    }
  };

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-800">
        <Clock className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
        <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          No audit logs recorded yet
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          Trigger recovery on this customer to generate immutable audit entries.
        </div>
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
      {logs.map((log) => {
        const visuals = getEventVisuals(log.eventType);
        const Icon = visuals.icon;
        const isExpanded = !!expandedLogs[log.id];
        const data = log.parsedData || {};

        const messageContent = typeof data.messageContent === 'string' ? data.messageContent : undefined;
        const channel = typeof data.channel === 'string' ? data.channel : undefined;
        const llmReasoning = typeof data.llmReasoning === 'string' ? data.llmReasoning : undefined;
        const rule = typeof data.rule === 'string' ? data.rule : undefined;

        return (
          <div key={log.id} className="relative group">
            {/* Timeline node icon */}
            <div
              className={`absolute -left-6 top-1 w-6 h-6 rounded-full border ${visuals.border} ${visuals.bg} flex items-center justify-center shadow-xs transition-transform group-hover:scale-110`}
            >
              <Icon className={`w-3.5 h-3.5 ${visuals.color}`} />
            </div>

            {/* Event Box */}
            <div className="ml-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 shadow-2xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {visuals.title}
                  </span>
                  {getActorBadge(log.actor)}
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  {log.createdAt}
                </span>
              </div>

              {/* Quick Summary Preview */}
              {messageContent && (
                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200">
                  <span className="font-semibold text-zinc-500 text-[10px] uppercase block mb-1">
                    Message Delivered ({channel || 'Channel'}):
                  </span>
                  {messageContent}
                </div>
              )}

              {llmReasoning && (
                <div className="p-2.5 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-[10px] uppercase block mb-1">
                    AI Chain-of-Thought Reasoning:
                  </span>
                  {llmReasoning}
                </div>
              )}

              {rule && (
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between">
                  <span>
                    <strong>Rule:</strong> {rule}
                  </span>
                  <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700">
                    Action Halted
                  </Badge>
                </div>
              )}

              {/* Expand/Collapse JSON Payload */}
              <div className="pt-1 flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-400">ID: {log.id}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleExpand(log.id)}
                  className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                >
                  {isExpanded ? (
                    <>
                      Hide Raw Payload <ChevronUp className="w-3 h-3 ml-1" />
                    </>
                  ) : (
                    <>
                      Inspect Payload <ChevronDown className="w-3 h-3 ml-1" />
                    </>
                  )}
                </Button>
              </div>

              {isExpanded && (
                <pre className="p-2.5 rounded-lg bg-zinc-950 text-zinc-100 text-[11px] font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
