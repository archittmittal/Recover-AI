import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * RA-25 — migrations are the single source of schema truth, and a database created before a
 * schema change must converge on next boot.
 *
 * Each case builds a database on disk, then boots the application's db module against it in a
 * fresh module registry so the module-level connection cache does not leak between cases.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra25-'));

/**
 * A faithful legacy fixture: migration 0000 is, by definition, the pre-0002 schema. Applying
 * it directly — without writing a ledger — reproduces exactly what the old inline
 * `CREATE TABLE IF NOT EXISTS` block left on disk.
 */
function buildLegacyDatabase(dbPath: string): void {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/db/migrations/0000_init.sql'),
    'utf8'
  );
  const h = new Database(dbPath);
  for (const stmt of sql.split('--> statement-breakpoint')) {
    if (stmt.trim()) h.exec(stmt);
  }
  h.prepare(
    `INSERT INTO customers (id,name,email,phone,preferred_language,segment,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run('cust_legacy', 'Legacy Row', 'legacy@example.com', '+919000000000', 'en', 'retail', 'x', 'x');
  h.close();
}

/**
 * The connection cache lives on globalThis (deliberately — it survives Next.js hot reload),
 * so vi.resetModules() alone does not give a test a fresh connection. Clear both.
 */
function resetDbSingleton() {
  const g = globalThis as unknown as Record<string, unknown>;
  (g.sqlite as { close?: () => void } | undefined)?.close?.();
  g.sqlite = undefined;
  g.db = undefined;
  vi.resetModules();
}

async function bootAgainst(dbPath: string) {
  process.env.DATABASE_URL = `file:${dbPath}`;
  resetDbSingleton();
  const { db } = await import('../src/lib/db');
  const { customers } = await import('../src/lib/db/schema');
  await db.select().from(customers); // force lazy init + migrate()
  return new Database(dbPath, { readonly: true });
}

const columnsOf = (h: Database.Database, t: string) =>
  (h.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);

/**
 * Every table and its columns, sorted. Spot-checking individual columns is what let a real
 * defect through: the adoption stamp skipped migration 0001, so recovery_actions was missing
 * provider_message_id while the two columns the test did assert were present. Comparing the
 * whole shape against a freshly migrated database is the assertion that actually holds.
 */
function fullSchema(h: Database.Database): Record<string, string[]> {
  const tables = (
    h
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
         AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
  return Object.fromEntries(tables.map((t) => [t, columnsOf(h, t).sort()]));
}

/** The schema a brand-new database gets from the migrations — the reference shape. */
async function freshSchema(): Promise<Record<string, string[]>> {
  const p = path.join(tmpDir, `ref-${crypto.randomUUID()}.db`);
  const h = await bootAgainst(p);
  const shape = fullSchema(h);
  h.close();
  return shape;
}

describe('RA-25 — schema convergence', () => {
  it('a fresh database is built by the migrations and records a ledger', async () => {
    const p = path.join(tmpDir, `fresh-${crypto.randomUUID()}.db`);
    const h = await bootAgainst(p);

    expect(columnsOf(h, 'customers')).toContain('razorpay_customer_id');
    const ledger = h.prepare(`SELECT COUNT(*) AS n FROM __drizzle_migrations`).get() as { n: number };
    expect(ledger.n).toBeGreaterThan(0);
    h.close();
  });

  it('a legacy pre-0002 database converges instead of silently staying stale', async () => {
    const p = path.join(tmpDir, `legacy-${crypto.randomUUID()}.db`);
    buildLegacyDatabase(p);

    // Precondition: the fixture really is stale.
    const before = new Database(p, { readonly: true });
    expect(columnsOf(before, 'customers')).not.toContain('razorpay_customer_id');
    before.close();

    const h = await bootAgainst(p);

    // The column that migration 0002 adds is present after boot.
    expect(columnsOf(h, 'customers')).toContain('razorpay_customer_id');
    // Migration 0003's index is present too.
    const idx = h
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_audit_journey'`)
      .get();
    expect(idx).toBeDefined();
    // Pre-existing data survived the migration.
    const row = h.prepare(`SELECT name FROM customers WHERE id='cust_legacy'`).get() as { name: string };
    expect(row.name).toBe('Legacy Row');
    // The converged shape matches a freshly migrated database exactly.
    expect(fullSchema(h)).toEqual(await freshSchema());
    h.close();
  });

  it('converges a legacy database that already carries the idx_* indexes', async () => {
    // The retired inline DDL created these indexes from its first version, independently of
    // migration 0003. So a real stale database has the indexes but NOT the 0002 column —
    // a combination that made an index-based generation check stamp it as fully migrated
    // and skip 0002 forever. Regression guard for that.
    const p = path.join(tmpDir, `hybrid-${crypto.randomUUID()}.db`);
    buildLegacyDatabase(p);
    const pre = new Database(p);
    pre.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_journey ON audit_logs(journey_id);
      CREATE INDEX IF NOT EXISTS idx_failures_customer ON payment_failures(customer_id);
      CREATE INDEX IF NOT EXISTS idx_actions_journey ON recovery_actions(journey_id);
      CREATE INDEX IF NOT EXISTS idx_journeys_customer ON recovery_journeys(customer_id);
      CREATE INDEX IF NOT EXISTS idx_journeys_failure ON recovery_journeys(failure_id);
    `);
    expect(columnsOf(pre, 'customers')).not.toContain('razorpay_customer_id');
    pre.close();

    const h = await bootAgainst(p);

    expect(columnsOf(h, 'customers')).toContain('razorpay_customer_id');
    expect(
      h.prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_audit_journey'`).get()
    ).toBeDefined();
    expect(
      (h.prepare(`SELECT name FROM customers WHERE id='cust_legacy'`).get() as { name: string }).name
    ).toBe('Legacy Row');
    expect(fullSchema(h)).toEqual(await freshSchema());
    h.close();
  });

  it('rejects a non-file DATABASE_URL rather than treating it as a filename', async () => {
    process.env.DATABASE_URL = 'libsql://example.turso.io';
    resetDbSingleton();
    const { db } = await import('../src/lib/db');
    const { customers } = await import('../src/lib/db/schema');
    // The guard runs inside getOrCreateDb(), which the Proxy invokes synchronously.
    expect(() => db.select().from(customers)).toThrow(/Unsupported DATABASE_URL/);
  });
});
