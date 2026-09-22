import { RecoveryStrategy } from './classifier';

export type RecoveryChannel = 'whatsapp' | 'sms' | 'email' | 'voice';

export interface StrategyConfig {
  strategy: RecoveryStrategy;
  channelSequence: RecoveryChannel[];
  maxAttempts: number;
  initialChannel: RecoveryChannel;
  allowDiscount: boolean;
  maxDiscountPercentage: number;
  retryIntervalsHours: number[];
}

export const STRATEGY_CONFIGS: Record<RecoveryStrategy, StrategyConfig> = {
  payment_link: {
    strategy: 'payment_link',
    channelSequence: ['whatsapp', 'sms', 'voice'],
    maxAttempts: 3,
    initialChannel: 'whatsapp',
    allowDiscount: false,
    maxDiscountPercentage: 0,
    retryIntervalsHours: [1, 24, 72],
  },
  conversational: {
    strategy: 'conversational',
    channelSequence: ['whatsapp', 'sms', 'voice'],
    maxAttempts: 3,
    initialChannel: 'whatsapp',
    allowDiscount: true,
    maxDiscountPercentage: 10,
    retryIntervalsHours: [2, 24, 48],
  },
  smart_retry: {
    strategy: 'smart_retry',
    channelSequence: ['whatsapp', 'sms'],
    maxAttempts: 3,
    initialChannel: 'whatsapp', // Only used if retry attempts fail
    allowDiscount: false,
    maxDiscountPercentage: 0,
    retryIntervalsHours: [1, 24, 72],
  },
  invoice_reminder: {
    strategy: 'invoice_reminder',
    channelSequence: ['email', 'whatsapp', 'voice'],
    maxAttempts: 3,
    initialChannel: 'email',
    allowDiscount: false,
    maxDiscountPercentage: 0,
    retryIntervalsHours: [24, 168, 336], // each delay is relative to the previous attempt, not T+0: +24h, then +168h after that, then +336h after that
  },
  /**
   * Arm B — what a cron job and one message template would have achieved on their own.
   *
   * One channel (no escalation ladder), one fixed cadence for every failure regardless of its
   * cause, and no LLM anywhere: no classification, no per-failure strategy, no personalised
   * copy. Everything the agent adds is what the C − B delta is supposed to measure, so every
   * one of those things has to be absent here.
   */
  rules_only: {
    strategy: 'rules_only',
    channelSequence: ['whatsapp'],
    maxAttempts: 3,
    initialChannel: 'whatsapp',
    allowDiscount: false,
    maxDiscountPercentage: 0,
    retryIntervalsHours: [24, 24, 24],
  },

  /**
   * Arm A — detect and record, never reach out. maxAttempts is 0 so that even a caller who
   * reaches processRecoveryAttempt directly cannot dispatch on this journey.
   */
  no_outreach: {
    strategy: 'no_outreach',
    channelSequence: [],
    maxAttempts: 0,
    initialChannel: 'whatsapp',
    allowDiscount: false,
    maxDiscountPercentage: 0,
    retryIntervalsHours: [],
  },

  merchant_alert: {
    strategy: 'merchant_alert',
    channelSequence: ['email'],
    maxAttempts: 1,
    initialChannel: 'email',
    allowDiscount: false,
    maxDiscountPercentage: 0,
    retryIntervalsHours: [],
  },
};

/**
 * Resolves next communication channel in the escalation ladder.
 */
export function getChannelForAttempt(
  strategy: RecoveryStrategy,
  attemptNumber: number
): RecoveryChannel {
  const config = STRATEGY_CONFIGS[strategy];
  if (!config || config.channelSequence.length === 0) {
    return config?.initialChannel || 'whatsapp';
  }

  const index = Math.min(Math.max(attemptNumber - 1, 0), config.channelSequence.length - 1);
  return config.channelSequence[index];
}
