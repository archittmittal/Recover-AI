export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  private fixedDate: Date;

  constructor(date: Date | string) {
    this.fixedDate = typeof date === 'string' ? new Date(date) : date;
  }

  now(): Date {
    return new Date(this.fixedDate.getTime());
  }

  setDate(date: Date | string) {
    this.fixedDate = typeof date === 'string' ? new Date(date) : date;
  }
}

/**
 * A clock that runs at real speed but offset from real time, so a demo can cross a boundary
 * that would otherwise take days to reach — the 8AM-7PM IST contact window, or the T+1h /
 * T+24h / T+72h retry ladder (RA-31).
 *
 * Offset rather than frozen, deliberately: a frozen clock would make every timestamp in a
 * demo identical and hide the ordering an evaluator is being asked to read.
 */
export class VirtualClock implements Clock {
  private offsetMs = 0;

  constructor(offsetMs = 0) {
    this.offsetMs = offsetMs;
  }

  setOffset(ms: number) {
    this.offsetMs = ms;
  }

  getOffset(): number {
    return this.offsetMs;
  }

  setTime(date: Date | string) {
    const target = typeof date === 'string' ? new Date(date) : date;
    this.offsetMs = target.getTime() - Date.now();
  }

  /** Moves the clock forward by `ms`. Negative values are rejected — see `demo-clock.ts`. */
  advanceBy(ms: number) {
    if (ms < 0) {
      throw new Error('[VirtualClock] Time only moves forward. Reseed to return to real time.');
    }
    this.offsetMs += ms;
  }

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

/**
 * The clock is a process-wide singleton held on `globalThis`, for the same reason the database
 * connection is: Next.js re-evaluates route modules on hot reload, and a module-scoped `let`
 * would silently hand a second copy of the clock to half the routes — so the simulator would
 * advance a clock the coordinator never reads.
 */
const globalForClock = globalThis as unknown as { recoverAiClock: Clock | undefined };

export function getClock(): Clock {
  if (!globalForClock.recoverAiClock) {
    globalForClock.recoverAiClock = new SystemClock();
  }
  return globalForClock.recoverAiClock;
}

export function setClock(clock: Clock) {
  globalForClock.recoverAiClock = clock;
}

/**
 * Converts a Date to an IST timestamp object
 */
export function getISTTime(date: Date): { hour: number; minute: number; second: number; dateString: string } {
  const optionsStr = date.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  
  // Format: MM/DD/YYYY, HH:MM:SS
  const [datePart, timePart] = optionsStr.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  
  return {
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    second: parseInt(second, 10),
    dateString: `${year}-${month}-${day}`,
  };
}

/**
 * Formats a Date to an ISO 8601 string in IST timezone (Asia/Kolkata)
 * Example: 2026-08-21T10:00:00+05:30
 */
export function formatIST(date: Date): string {
  const { hour, minute, second, dateString } = getISTTime(date);
  
  const pad = (num: number) => String(num).padStart(2, '0');
  
  return `${dateString}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`;
}

/**
 * Checks if the given date is within the strict 8 AM to 7 PM IST contact window.
 * Bounds: 08:00:00 IST inclusive to 19:00:00 IST exclusive.
 * 07:59:59 IST -> false
 * 08:00:00 IST -> true
 * 18:59:59 IST -> true
 * 19:00:00 IST -> false
 */
export function isWithinContactHours(date: Date): boolean {
  const { hour, minute, second } = getISTTime(date);
  
  const timeInSeconds = hour * 3600 + minute * 60 + second;
  const startInSeconds = 8 * 3600; // 08:00:00
  const endInSeconds = 19 * 3600;  // 19:00:00
  
  return timeInSeconds >= startInSeconds && timeInSeconds < endInSeconds;
}
