import { db } from '../db';
import { auditLogs } from '../db/schema';
import { generateId } from './ids';
import { getClock, formatIST } from './time';

export type AuditActor = 'system' | 'agent' | 'customer' | 'razorpay';

export interface AuditLogParams {
  journeyId: string;
  actionId?: string | null;
  actor: AuditActor;
  eventType: string;
  eventData: Record<string, unknown>;
}

/**
 * Writes an append-only audit log entry to the database.
 * Every key system event, state transition, and messaging action must call this function.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<string> {
  const logId = generateId('audit');
  const nowStr = formatIST(getClock().now());
  
  await db.insert(auditLogs).values({
    id: logId,
    journeyId: params.journeyId,
    actionId: params.actionId || null,
    actor: params.actor,
    eventType: params.eventType,
    eventData: JSON.stringify(params.eventData),
    createdAt: nowStr,
  });
  
  return logId;
}
