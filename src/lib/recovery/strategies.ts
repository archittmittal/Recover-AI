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
    retryIntervalsHours: [24, 168, 336], // Day 1, Day 7, Day 14
  },
  merchant_alert: {
    strategy: 'merchant_alert',
    channelSequence: [],
    maxAttempts: 0,
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
    return 'whatsapp';
  }

  const index = Math.min(Math.max(attemptNumber - 1, 0), config.channelSequence.length - 1);
  return config.channelSequence[index];
}
