import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Ban,
  Activity,
} from 'lucide-react';

export interface JourneyStatusBadgeProps {
  status: string;
  className?: string;
  showIcon?: boolean;
}

interface StatusConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  classes: string;
  iconClasses: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  resolved: {
    label: 'Recovered',
    icon: CheckCircle2,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    iconClasses: 'text-emerald-600 dark:text-emerald-400',
  },
  recovering: {
    label: 'Recovering',
    icon: Activity,
    classes: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    iconClasses: 'text-blue-600 dark:text-blue-400 animate-pulse',
  },
  diagnosing: {
    label: 'Diagnosing',
    icon: Clock,
    classes: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    iconClasses: 'text-amber-600 dark:text-amber-400',
  },
  escalating: {
    label: 'Escalating',
    icon: ArrowUpRight,
    classes: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    iconClasses: 'text-purple-600 dark:text-purple-400',
  },
  exhausted: {
    label: 'Exhausted (3/3)',
    icon: ShieldAlert,
    classes: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    iconClasses: 'text-rose-600 dark:text-rose-400',
  },
  opted_out: {
    label: 'Opted Out (STOP)',
    icon: Ban,
    classes: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    iconClasses: 'text-zinc-500',
  },
  detected: {
    label: 'Detected',
    icon: AlertTriangle,
    classes: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    iconClasses: 'text-sky-600',
  },
};

export function JourneyStatusBadge({
  status,
  className = '',
  showIcon = true,
}: JourneyStatusBadgeProps) {
  const config = STATUS_MAP[status?.toLowerCase()];

  if (!config) {
    return (
      <Badge variant="outline" className={`text-zinc-600 border-zinc-200 ${className}`}>
        {status}
      </Badge>
    );
  }

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`font-medium ${config.classes} ${className}`}>
      {showIcon && <Icon className={`w-3 h-3 mr-1 ${config.iconClasses}`} />}
      {config.label}
    </Badge>
  );
}
