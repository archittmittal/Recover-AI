import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  db: BetterSQLite3Database<typeof schema> | undefined;
};

function initializeTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      razorpay_customer_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      preferred_language TEXT NOT NULL,
      segment TEXT NOT NULL,
      total_failures INTEGER NOT NULL DEFAULT 0,
      total_recovered_amount INTEGER NOT NULL DEFAULT 0,
      dnd_status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_failures (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      razorpay_payment_id TEXT NOT NULL,
      razorpay_order_id TEXT NOT NULL,
      razorpay_subscription_id TEXT,
      razorpay_invoice_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      payment_method TEXT NOT NULL,
      failure_type TEXT NOT NULL,
      error_code TEXT NOT NULL,
      error_source TEXT NOT NULL,
      error_step TEXT NOT NULL,
      error_reason TEXT NOT NULL,
      error_description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_journeys (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      failure_id TEXT NOT NULL REFERENCES payment_failures(id),
      status TEXT NOT NULL,
      strategy TEXT NOT NULL,
      amount_at_risk INTEGER NOT NULL,
      amount_recovered INTEGER NOT NULL DEFAULT 0,
      recovery_payment_id TEXT,
      payment_link_id TEXT,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      current_attempt INTEGER NOT NULL DEFAULT 0,
      current_channel TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_actions (
      id TEXT PRIMARY KEY,
      journey_id TEXT NOT NULL REFERENCES recovery_journeys(id),
      attempt_number INTEGER NOT NULL,
      channel TEXT NOT NULL,
      action_type TEXT NOT NULL,
      message_content TEXT NOT NULL,
      llm_reasoning TEXT,
      delivery_status TEXT NOT NULL,
      provider_message_id TEXT,
      customer_response TEXT,
      outcome TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      executed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      journey_id TEXT NOT NULL REFERENCES recovery_journeys(id),
      action_id TEXT REFERENCES recovery_actions(id),
      actor TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      processing_status TEXT NOT NULL,
      error_message TEXT,
      received_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_failures_customer ON payment_failures(customer_id);
    CREATE INDEX IF NOT EXISTS idx_journeys_customer ON recovery_journeys(customer_id);
    CREATE INDEX IF NOT EXISTS idx_journeys_failure ON recovery_journeys(failure_id);
    CREATE INDEX IF NOT EXISTS idx_actions_journey ON recovery_actions(journey_id);
    CREATE INDEX IF NOT EXISTS idx_audit_journey ON audit_logs(journey_id);
  `);
}

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
  sqlite.pragma('foreign_keys = ON');

  // Initialize tables idempotently
  initializeTables(sqlite);

  globalForDb.sqlite = sqlite;

  const dbInstance = drizzle(sqlite, { schema });
  globalForDb.db = dbInstance;

  return dbInstance;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    const instance = getOrCreateDb();
    const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(instance) : val;
  },
});

export type DbClient = BetterSQLite3Database<typeof schema>;
