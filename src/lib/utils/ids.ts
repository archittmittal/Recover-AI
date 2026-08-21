import { nanoid } from 'nanoid';

export type IdPrefix = 'cust' | 'fail' | 'rj' | 'ra' | 'audit';

export function generateId(prefix: IdPrefix): string {
  // Generates prefixed ID, e.g. cust_abc123xyz789
  return `${prefix}_${nanoid(16)}`;
}
