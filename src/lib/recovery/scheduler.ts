import { getClock, getISTTime, formatIST, isWithinContactHours } from '../utils/time';

/**
 * Calculates the next valid execution timestamp for customer outreach.
 * Enforces the strict 8:00 AM to 7:00 PM IST contact hours window.
 * If the calculated time falls outside the contact window, defers to 8:00 AM IST on the next valid day.
 */
export function calculateNextScheduledTime(offsetHours = 0): {
  scheduledDate: Date;
  scheduledIso: string;
  deferredDueToContactHours: boolean;
} {
  const clock = getClock();
  const baseTime = clock.now();
  const targetTime = new Date(baseTime.getTime() + offsetHours * 60 * 60 * 1000);

  if (isWithinContactHours(targetTime)) {
    return {
      scheduledDate: targetTime,
      scheduledIso: formatIST(targetTime),
      deferredDueToContactHours: false,
    };
  }

  // If outside contact hours, advance to next 8:00 AM IST
  const { hour, dateString } = getISTTime(targetTime);
  const [year, month, day] = dateString.split('-').map(Number);

  // If before 8:00 AM IST on the same day, set to 8:00 AM today
  // If after 7:00 PM IST, set to 8:00 AM tomorrow
  const nextDayOffset = hour >= 19 ? 1 : 0;
  
  // Construct date at 08:00:00 IST (UTC 02:30:00)
  const deferredUtc = new Date(Date.UTC(year, month - 1, day + nextDayOffset, 2, 30, 0, 0));

  return {
    scheduledDate: deferredUtc,
    scheduledIso: formatIST(deferredUtc),
    deferredDueToContactHours: true,
  };
}
