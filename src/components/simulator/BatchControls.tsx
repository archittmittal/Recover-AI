'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RotateCcw,
  Zap,
  Send,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface BatchControlsProps {
  onActionComplete: () => void;
}

export function BatchControls({ onActionComplete }: BatchControlsProps) {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSeed = async () => {
    setIsSeeding(true);
    setStatusMessage('Generating 50+ synthetic failures across all scenarios...');
    try {
      const res = await fetch('/api/simulator/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setStatusMessage(`Successfully seeded ${json.data.count} synthetic failure records!`);
        onActionComplete();
      } else {
        setStatusMessage(`Error seeding: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Seed error:', err);
      setStatusMessage('Failed to seed batch.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRunAgent = async () => {
    setIsRecovering(true);
    setStatusMessage('Autonomous agent processing failure classification, strategies & dispatch...');
    try {
      const res = await fetch('/api/recovery/trigger', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setStatusMessage(
          `Recovery workflow executed for ${json.data.processedCount} journeys!`
        );
        onActionComplete();
      } else {
        setStatusMessage(`Recovery error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Run recovery error:', err);
      setStatusMessage('Failed to trigger recovery.');
    } finally {
      setIsRecovering(false);
    }
  };

  const handleSimulateWebhook = async (scenario: 'one_time' | 'subscription' | 'abandonment') => {
    setIsSendingWebhook(true);
    setStatusMessage(`Simulating Razorpay webhook for ${scenario.replace(/_/g, ' ')}...`);
    try {
      const payload = {
        id: `evt_sim_${Date.now()}`,
        entity: 'event',
        account_id: 'acc_demo_test',
        event: scenario === 'subscription' ? 'subscription.pending' : 'payment.failed',
        contains: ['payment'],
        payload: {
          payment: {
            entity: {
              id: `pay_sim_${Date.now()}`,
              amount: scenario === 'subscription' ? 149900 : 299900,
              currency: 'INR',
              status: 'failed',
              order_id: `order_sim_${Date.now()}`,
              method: scenario === 'subscription' ? 'emandate' : 'card',
              email: 'aarav.sharma@example.com',
              contact: '+919876543210',
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Payment authorization failed.',
              error_source: 'customer',
              error_step: 'authorization',
              error_reason: scenario === 'subscription' ? 'mandate_inactive' : 'insufficient_funds',
              notes: {
                customer_name: 'Aarav Sharma',
              },
            },
          },
        },
      };

      const res = await fetch('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage(`Webhook received & journey initiated! (ID: ${json.data.eventId})`);
        onActionComplete();
      } else {
        setStatusMessage(`Webhook error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Webhook error:', err);
      setStatusMessage('Failed to simulate webhook.');
    } finally {
      setIsSendingWebhook(false);
    }
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Batch & Engine Simulation Controls
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">
              Seed synthetic data, trigger agent processing, or inject real-time Razorpay webhooks
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-semibold">
            Interactive Testbed
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Core Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            onClick={handleSeed}
            disabled={isSeeding || isRecovering}
            variant="outline"
            className="w-full justify-start text-xs border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800"
          >
            {isSeeding ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-zinc-600" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2 text-zinc-600" />
            )}
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">Seed 50+ Failures Batch</span>
              <span className="text-[10px] text-zinc-500">Cards, UPI, Subscriptions & Invoices</span>
            </div>
          </Button>

          <Button
            onClick={handleRunAgent}
            disabled={isSeeding || isRecovering}
            className="w-full justify-start text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            {isRecovering ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            <div className="flex flex-col items-start text-left">
              <span className="font-semibold">Run AI Recovery Agent</span>
              <span className="text-[10px] text-indigo-100">Process queue & escalate channels</span>
            </div>
          </Button>
        </div>

        {/* Live Webhook Injection Buttons */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Simulate Incoming Razorpay Webhook Event:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSimulateWebhook('one_time')}
              disabled={isSendingWebhook}
              className="text-xs justify-start h-8"
            >
              <Send className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              payment.failed (One-Time)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSimulateWebhook('subscription')}
              disabled={isSendingWebhook}
              className="text-xs justify-start h-8"
            >
              <Send className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              subscription.pending (Mandate)
            </Button>
          </div>
        </div>

        {/* Live Status Indicator */}
        {statusMessage && (
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="line-clamp-2">{statusMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
