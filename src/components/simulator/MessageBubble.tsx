'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageCircle,
  MessageSquare,
  PhoneCall,
  Check,
  CheckCheck,
  ExternalLink,
  CreditCard,
  Cpu,
  User,
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender: 'agent' | 'customer' | 'system';
  channel?: 'whatsapp' | 'sms' | 'voice' | 'email';
  content: string;
  timestamp: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  paymentLinkUrl?: string;
  llmReasoning?: string;
  onPayClick?: () => void;
}

interface MessageBubbleProps {
  message: ChatMessage;
  customerName?: string;
}

export function MessageBubble({ message, customerName = 'Customer' }: MessageBubbleProps) {
  const isCustomer = message.sender === 'customer';
  const isSystem = message.sender === 'system';

  const getChannelIcon = () => {
    switch (message.channel) {
      case 'whatsapp':
        return <MessageCircle className="w-3 h-3 text-emerald-600" />;
      case 'sms':
        return <MessageSquare className="w-3 h-3 text-blue-600" />;
      case 'voice':
        return <PhoneCall className="w-3 h-3 text-purple-600" />;
      default:
        return null;
    }
  };

  const getDeliveryTicks = () => {
    if (isCustomer) return null;
    if (message.deliveryStatus === 'read') {
      return <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline ml-1" />;
    }
    if (message.deliveryStatus === 'delivered') {
      return <CheckCheck className="w-3.5 h-3.5 text-zinc-400 inline ml-1" />;
    }
    return <Check className="w-3.5 h-3.5 text-zinc-400 inline ml-1" />;
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex w-full my-2.5 ${isCustomer ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-2xs space-y-2 ${
          isCustomer
            ? 'bg-emerald-600 text-white rounded-br-xs'
            : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-xs'
        }`}
      >
        {/* Header (Sender & Channel) */}
        <div className="flex items-center justify-between gap-3 text-[11px] pb-1 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-1.5 font-semibold">
            {isCustomer ? (
              <>
                <User className="w-3.5 h-3.5" />
                <span>{customerName}</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>RecoverAI</span>
                {message.channel && (
                  <Badge variant="secondary" className="text-[9px] py-0 px-1 font-mono uppercase">
                    {message.channel}
                  </Badge>
                )}
              </>
            )}
          </div>
          <span className={`font-mono text-[10px] ${isCustomer ? 'text-emerald-100' : 'text-zinc-400'}`}>
            {message.timestamp}
          </span>
        </div>

        {/* Message Body */}
        <p className="text-xs leading-relaxed whitespace-pre-wrap">{message.content}</p>

        {/* Embedded Payment Link Call to Action (if in agent message) */}
        {!isCustomer && message.paymentLinkUrl && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-200">
                  Razorpay Recovery Payment Link
                </div>
              </div>
              {message.onPayClick && (
                <Button
                  size="sm"
                  onClick={message.onPayClick}
                  className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                >
                  Simulate Payment <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Footer (Delivery ticks for Agent) */}
        {!isCustomer && (
          <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
            <div className="flex items-center gap-1">
              {getChannelIcon()}
              <span className="capitalize">{message.deliveryStatus || 'sent'}</span>
            </div>
            <div>{getDeliveryTicks()}</div>
          </div>
        )}
      </div>
    </div>
  );
}
