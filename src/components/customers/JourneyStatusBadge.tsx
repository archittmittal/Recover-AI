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

export function JourneyStatusBadge({
  status,
  className = '',
  showIcon = true,
}: JourneyStatusBadgeProps) {
  switch (status.toLowerCase()) {
    case 'resolved':
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-medium ${className}`}
        >
          {showIcon && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />}
          Recovered
        </Badge>
      );
    case 'recovering':
      return (
        <Badge
          variant="outline"
          className={`bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 font-medium ${className}`}
        >
          {showIcon && <Activity className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400 animate-pulse" />}
          Recovering
        </Badge>
      );
    case 'diagnosing':
      return (
        <Badge
          variant="outline"
          className={`bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 font-medium ${className}`}
        >
          {showIcon && <Clock className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400" />}
          Diagnosing
        </Badge>
      );
    case 'escalating':
      return (
        <Badge
          variant="outline"
          className={`bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 font-medium ${className}`}
        >
          {showIcon && <ArrowUpRight className="w-3 h-3 mr-1 text-purple-600 dark:text-purple-400" />}
          Escalating
        </Badge>
      );
    case 'exhausted':
      return (
        <Badge
          variant="outline"
          className={`bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 font-medium ${className}`}
        >
          {showIcon && <ShieldAlert className="w-3 h-3 mr-1 text-rose-600 dark:text-rose-400" />}
          Exhausted (3/3)
        </Badge>
      );
    case 'opted_out':
      return (
        <Badge
          variant="outline"
          className={`bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 font-medium ${className}`}
        >
          {showIcon && <Ban className="w-3 h-3 mr-1 text-zinc-500" />}
          Opted Out (STOP)
        </Badge>
      );
    case 'detected':
      return (
        <Badge
          variant="outline"
          className={`bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800 font-medium ${className}`}
        >
          {showIcon && <AlertTriangle className="w-3 h-3 mr-1 text-sky-600" />}
          Detected
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={`text-zinc-600 border-zinc-200 ${className}`}>
          {status}
        </Badge>
      );
  }
}
