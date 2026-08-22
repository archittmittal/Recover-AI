'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MessageBubble, ChatMessage } from './MessageBubble';
import { JourneyStatusBadge } from '@/components/customers/JourneyStatusBadge';
import {
  Send,
  CreditCard,
  Ban,
  Clock,
  HelpCircle,
  Loader2,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

export interface SimCustomer {
  id: string;
  name: string;
  phone: string;
  preferredLanguage: string;
}

export interface SimJourney {
  id: string;
  status: string;
  strategy: string;
  amountAtRisk: number;
  amountRecovered: number;
  maxAttempts: number;
  currentAttempt: number;
  createdAt?: string;
}

export interface SimAction {
  id: string;
  channel?: 'whatsapp' | 'sms' | 'voice' | 'email';
  messageContent?: string;
  customerResponse?: string | null;
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  llmReasoning?: string | null;
  executedAt?: string;
  createdAt?: string;
}

interface CustomerSimulatorProps {
  customer?: SimCustomer | null;
  journey?: SimJourney | null;
  actions: SimAction[];
  onRefresh: () => void;
}

export function CustomerSimulator({
  customer,
  journey,
  actions,
  onRefresh,
}: CustomerSimulatorProps) {
  const [inputText, setInputText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Handle Pay with Payment Link
  const handlePay = async () => {
    if (!journey || !customer) return;
    setIsPaying(true);
    setStatusNotification('Simulating Razorpay payment link settlement...');

    try {
      const res = await fetch('/api/simulator/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journeyId: journey.id,
          customerId: customer.id,
          amount: journey.amountAtRisk,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setStatusNotification(
          `Payment successful! ₹${(json.data.amountRecovered / 100).toLocaleString(
            'en-IN'
          )} recovered. Journey resolved.`
        );
        onRefresh();
      } else {
        setStatusNotification(`Payment error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Pay error:', err);
      setStatusNotification('Payment simulation failed.');
    } finally {
      setIsPaying(false);
    }
  };

  // Convert DB actions into ChatMessages
  const messages: ChatMessage[] = [];

  // Add initial failure notification system message
  if (journey) {
    messages.push({
      id: 'msg_init',
      sender: 'system',
      content: `⚠️ Payment Failure Detected: ₹${((journey.amountAtRisk || 0) / 100).toLocaleString(
        'en-IN'
      )} (${journey.strategy?.replace(/_/g, ' ')})`,
      timestamp: journey.createdAt || '',
    });
  }

  // Iterate over recovery actions and customer responses
  actions.forEach((action) => {
    // 1. Agent outreach message
    if (action.messageContent) {
      messages.push({
        id: `ra_agent_${action.id}`,
        sender: 'agent',
        channel: action.channel,
        content: action.messageContent,
        timestamp: action.executedAt || action.createdAt || '',
        deliveryStatus: action.deliveryStatus,
        paymentLinkUrl: `https://rzp.io/i/recov_${journey?.id || 'demo'}`,
        llmReasoning: action.llmReasoning || undefined,
        onPayClick: () => handlePay(),
      });
    }

    // 2. Customer response (if any)
    if (action.customerResponse) {
      messages.push({
        id: `ra_cust_${action.id}`,
        sender: 'customer',
        content: action.customerResponse,
        timestamp: action.executedAt || action.createdAt || '',
      });
    }
  });

  // Handle Send Text Reply
  const handleSendReply = async (textToSend?: string) => {
    const replyMessage = textToSend || inputText.trim();
    if (!replyMessage || !customer) return;

    setIsReplying(true);
    setInputText('');
    setStatusNotification('Sending message to RecoverAI agent...');

    try {
      const res = await fetch('/api/simulator/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          journeyId: journey?.id,
          message: replyMessage,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setStatusNotification(
          json.data.intent === 'opt_out'
            ? 'Customer opted out. Stopping rule triggered: outreach halted.'
            : 'Agent responded contextually via Google Gemini.'
        );
        onRefresh();
      } else {
        setStatusNotification(`Error: ${json.error?.message}`);
      }
    } catch (err) {
      console.error('Customer reply error:', err);
      setStatusNotification('Failed to send reply.');
    } finally {
      setIsReplying(false);
    }
  };

  if (!customer) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs h-full flex items-center justify-center p-12 text-center">
        <div className="space-y-2 text-zinc-500">
          <HelpCircle className="w-8 h-8 mx-auto text-zinc-400" />
          <div className="text-sm font-semibold">Select a customer from the left panel</div>
          <div className="text-xs">
            Play as any customer in the synthetic batch to test recovery links, stopping rules, and AI replies.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col h-[700px]">
      {/* Header with Customer Metadata */}
      <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-50">
              <span>Customer Sandbox: {customer.name}</span>
              {journey && <JourneyStatusBadge status={journey.status} />}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 mt-0.5">
              Phone: {customer.phone} • Language: {customer.preferredLanguage.toUpperCase()} • Attempt: {journey?.currentAttempt || 0}/{journey?.maxAttempts || 3}
            </CardDescription>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
              ₹{((journey?.amountAtRisk || 0) / 100).toLocaleString('en-IN')} At Risk
            </div>
            {journey && journey.amountRecovered > 0 && (
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                ₹{((journey.amountRecovered || 0) / 100).toLocaleString('en-IN')} Recovered
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Chat Messages Body */}
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-50/50 dark:bg-zinc-950/40">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
            <Sparkles className="w-8 h-8 text-indigo-500 mb-2" />
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Ready for Recovery Outreach
            </div>
            <div className="text-xs text-zinc-500 mt-1 max-w-sm">
              Trigger recovery to dispatch WhatsApp / SMS outreach to {customer.name}.
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} customerName={customer.name} />
          ))
        )}
      </CardContent>

      {/* Action Footer */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 space-y-2.5">
        {/* Quick Simulated Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-medium text-zinc-500 mr-1">Simulate:</span>

          <Button
            size="sm"
            onClick={handlePay}
            disabled={isPaying || isReplying || journey?.status === 'resolved'}
            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {isPaying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <CreditCard className="w-3.5 h-3.5 mr-1" />
            )}
            💳 Pay with Link
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendReply('STOP')}
            disabled={isReplying || journey?.status === 'opted_out'}
            className="h-7 text-xs text-rose-700 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 font-medium"
          >
            <Ban className="w-3.5 h-3.5 mr-1" />
            🛑 Send &apos;STOP&apos; (Opt-Out)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendReply('I will pay tomorrow morning')}
            disabled={isReplying}
            className="h-7 text-xs text-zinc-700 border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
          >
            <Clock className="w-3.5 h-3.5 mr-1 text-zinc-500" />
            &apos;Will pay tomorrow&apos;
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendReply('Why did my payment fail?')}
            disabled={isReplying}
            className="h-7 text-xs text-zinc-700 border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1 text-zinc-500" />
            &apos;Why did it fail?&apos;
          </Button>
        </div>

        {/* Freeform Text Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendReply();
          }}
          className="flex items-center gap-2"
        >
          <Input
            placeholder={`Reply to RecoverAI as ${customer.name.split(' ')[0]}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isReplying || journey?.status === 'resolved' || journey?.status === 'opted_out'}
            className="text-xs h-9"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isReplying || !inputText.trim()}
            className="h-9 px-3 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isReplying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>

        {/* Status Toast */}
        {statusNotification && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 pt-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">{statusNotification}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
