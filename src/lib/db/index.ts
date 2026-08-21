import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  db: BetterSQLite3Database<typeof schema> | undefined;
};

function getOrCreateDb(): BetterSQLite3Database<typeof schema> {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const dbUrl = process.env.DATABASE_URL || 'file:./data/recoverai.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = globalForDb.sqlite ?? new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  globalForDb.sqlite = sqlite;

  const dbInstance = drizzle(sqlite, { schema });
  globalForDb.db = dbInstance;

  return dbInstance;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const instance = getOrCreateDb();
    const val = (instance as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(instance) : val;
  },
});

export type DbClient = BetterSQLite3Database<typeof schema>;

