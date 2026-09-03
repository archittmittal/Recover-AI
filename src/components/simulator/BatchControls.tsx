'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RotateCcw,
  Zap,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  FastForward,
} from 'lucide-react';

interface BatchControlsProps {
  onActionComplete: () => void;
}

export function BatchControls({ onActionComplete }: BatchControlsProps) {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [clockIso, setClockIso] = useState<string | null>(null);
  const [isVirtualClock, setIsVirtualClock] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const loadClock = useCallback(async () => {
    try {
      const res = await fetch('/api/simulator/clock');
      const json = await res.json();
      if (json.success) {
        setClockIso(json.data.nowIso);
        setIsVirtualClock(json.data.isVirtual);
      }
    } catch (err) {
      console.error('Clock read error:', err);
    }
  }, []);

  // Mirrors the dashboard's mount fetch: the request is issued inside the effect and the state
  // is set from its callback, so the effect body itself performs no synchronous setState.
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch('/api/simulator/clock');
        const json = await res.json();
        if (isMounted && json.success) {
          setClockIso(json.data.nowIso);
          setIsVirtualClock(json.data.isVirtual);
        }
      } catch (err) {
        console.error('Clock read error:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Moves simulated time forward (RA-31). The contact window and the retry ladder play out over
   * days, so without this the two most defensible behaviours in the system cannot be shown in a
   * five-minute demo. Every advance is written to the audit trail, and time never moves back —
   * rewinding past a fired attempt would let the same outreach replay.
   */
  const handleAdvanceClock = async (body: { advanceMinutes?: number; toIso?: string }, label: string) => {
    setIsAdvancing(true);
    setStatusMessage(`Advancing simulated time ${label}...`);
    try {
      const res = await fetch('/api/simulator/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setClockIso(json.data.state.nowIso);
        setIsVirtualClock(true);
        setStatusMessage(json.data.message);
        onActionComplete();
      } else {
        setStatusMessage(`Clock error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Clock advance error:', err);
      setStatusMessage('Failed to advance the demo clock.');
    } finally {
      setIsAdvancing(false);
    }
  };

  /** Next occurrence of an IST hour, so "jump to 21:00" always moves forward. */
  const nextIstHourIso = (hour: number): string | undefined => {
    if (!clockIso) return undefined;
    const current = new Date(clockIso);
    const [datePart] = clockIso.split('T');
    let target = new Date(`${datePart}T${String(hour).padStart(2, '0')}:00:00+05:30`);
    if (target.getTime() <= current.getTime()) {
      target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    }
    return target.toISOString();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    setStatusMessage('Generating 50+ synthetic failures across all scenarios...');
    try {
      const res = await fetch('/api/simulator/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setStatusMessage(`Successfully seeded ${json.data.count} synthetic failure records!`);
        await loadClock(); // the seed route returns the process to real time
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

  /**
   * Asks the server to sign a simulated delivery and feed it to the real webhook handler
   * (`/api/simulator/webhook`). This used to POST an unsigned payload straight at
   * `/api/webhooks/razorpay`, which has answered 400 ever since RA-01 made signature
   * verification mandatory — both buttons were dead. The secret cannot come to the browser, so
   * the signing has to happen server-side.
   */
  const handleSimulateWebhook = async (scenario: 'card_decline' | 'mandate_failure') => {
    setIsSendingWebhook(true);
    setStatusMessage(`Signing and delivering a simulated ${scenario.replace('_', ' ')} webhook...`);
    try {
      const res = await fetch('/api/simulator/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage(json.data.message);
        onActionComplete();
      } else {
        setStatusMessage(`Webhook error: ${json.error?.message || json.data?.message}`);
      }
    } catch (err) {
      console.error('Webhook error:', err);
      setStatusMessage('Failed to simulate the webhook delivery.');
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

        {/* Demo clock (RA-31) */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              Simulated Clock (IST)
            </div>
            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
              {clockIso ? clockIso.replace('T', ' ').replace('+05:30', '') : '—'}
              {isVirtualClock && (
                <span className="ml-1.5 text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400">
                  virtual
                </span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: '+1 hour', body: { advanceMinutes: 60 } },
              { label: '+24 hours', body: { advanceMinutes: 60 * 24 } },
            ].map((option) => (
              <Button
                key={option.label}
                variant="outline"
                size="sm"
                onClick={() => handleAdvanceClock(option.body, option.label)}
                disabled={isAdvancing}
                className="text-xs justify-start h-8"
              >
                <FastForward className="w-3.5 h-3.5 mr-1.5 text-zinc-600" />
                {option.label}
              </Button>
            ))}
            {[
              { label: '21:00 (after hours)', hour: 21 },
              { label: '09:00 (next morning)', hour: 9 },
            ].map((option) => (
              <Button
                key={option.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  const toIso = nextIstHourIso(option.hour);
                  if (toIso) handleAdvanceClock({ toIso }, `to ${option.label}`);
                }}
                disabled={isAdvancing || !clockIso}
                className="text-xs justify-start h-8"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-600" />
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-500">
            Forward only, and every advance is written to the audit trail. Reseed to return to
            real time.
          </p>
        </div>

        {/* Live Webhook Injection Buttons */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Simulate a Signed Razorpay Webhook Delivery:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSimulateWebhook('card_decline')}
              disabled={isSendingWebhook}
              className="text-xs justify-start h-8"
            >
              <Send className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
              payment.failed (card decline)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSimulateWebhook('mandate_failure')}
              disabled={isSendingWebhook}
              className="text-xs justify-start h-8"
            >
              <Send className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              payment.failed (mandate)
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
