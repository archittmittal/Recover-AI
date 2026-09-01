import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  db: BetterSQLite3Database<typeof schema> | undefined;
};

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'src/lib/db/migrations');
const MIGRATIONS_TABLE = '__drizzle_migrations';

/**
 * Drizzle decides which migrations to run by comparing each journal entry's `when` against
 * the newest `created_at` in the ledger, so adoption stamps a database with the `when` of the
 * last migration it already has. Those values are read from the journal rather than copied
 * into constants — a hand-copied timestamp that drifts from a regenerated or reordered
 * journal would silently skip or replay a migration.
 */
export function generationTimestamps(): number[] {
  const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: { idx: number; when: number }[];
  };
  return [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => e.when);
}

/** Index into generationTimestamps(), named for the migration whose effects each one marks. */
const GEN = {
  BASE_TABLES: 0,          // 0000_init
  PROVIDER_MESSAGE_ID: 1,  // 0001 — recovery_actions.provider_message_id
  RAZORPAY_CUSTOMER_ID: 2, // 0002 — customers.razorpay_customer_id
  PERF_INDEXES: 3,         // 0003 — idx_* indexes
  TEMPLATE_FALLBACK: 4,    // 0004 — recovery_actions.is_template_fallback
} as const;

/**
 * Databases created before migrations became the single source of truth were built by an
 * inline `CREATE TABLE IF NOT EXISTS` block that lived in this file. They carry real tables
 * but no migration ledger, so Drizzle would try to replay `0000_init` against them and fail
 * on an already-existing table.
 *
 * Drizzle selects migrations by comparing each journal entry's `when` against the newest
 * `created_at` in the ledger, so adopting such a database is a matter of writing one row that
 * marks how far it already got. Detection reads the schema itself rather than trusting a
 * version marker the old code never wrote.
 *
 * Returns the journal timestamp to stamp, or null when the database is fresh and every
 * migration should run normally.
 */
function detectLegacyGeneration(sqlite: Database.Database): number | null {
  const hasTable = (name: string): boolean =>
    sqlite
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(name) !== undefined;

  // No application tables at all: a fresh database, nothing to adopt.
  if (!hasTable('customers')) return null;

  // Already has a ledger: Drizzle can take it from here.
  if (hasTable(MIGRATIONS_TABLE)) return null;

  const hasColumn = (table: string, column: string): boolean =>
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
      (c) => c.name === column
    );

  // Every migration that alters a table needs a probe here, checked newest-first, and the
  // floor must be the base-tables generation. Stamping a database at the generation of a
  // migration it has NOT run marks that migration applied and skips it permanently — not
  // hypothetical: 0001 adds recovery_actions.provider_message_id, and a floor one generation
  // too high left that column missing forever on a real database.
  //
  // Generation is read from columns only. Index presence is deliberately NOT used as
  // evidence: the retired inline DDL created the idx_* indexes from its first version,
  // independently of migration 0003, so a legacy database can carry those indexes while
  // still missing the 0002 column. Treating an index as proof of generation skips 0002 and
  // leaves the database permanently stale — the exact failure this adoption path exists to
  // repair.
  const when = generationTimestamps();
  if (hasColumn('recovery_actions', 'is_template_fallback')) return when[GEN.TEMPLATE_FALLBACK];
  if (hasColumn('customers', 'razorpay_customer_id')) return when[GEN.RAZORPAY_CUSTOMER_ID];
  if (hasColumn('recovery_actions', 'provider_message_id')) return when[GEN.PROVIDER_MESSAGE_ID];
  return when[GEN.BASE_TABLES];
}

/**
 * Migration 0003 issues bare `CREATE INDEX` statements, which fail if the index already
 * exists. A legacy database built by the inline DDL carries these indexes without having run
 * 0003, so they are dropped before the stamp and recreated by the migration. Indexes are
 * derived data — dropping them loses nothing.
 */
function clearIndexesCreatedAfter(sqlite: Database.Database, generation: number): void {
  if (generation >= generationTimestamps()[GEN.PERF_INDEXES]) return;
  const created = [
    'idx_audit_journey',
    'idx_failures_customer',
    'idx_actions_journey',
    'idx_journeys_customer',
    'idx_journeys_failure',
  ];
  for (const name of created) {
    sqlite.exec(`DROP INDEX IF EXISTS ${name}`);
  }
}

function stampLegacyGeneration(sqlite: Database.Database, when: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  sqlite
    .prepare(`INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`)
    .run('legacy-inline-ddl-adoption', when);
  console.warn(
    `[db] Adopted a pre-migration database (generation ${when}); pending migrations will now apply.`
  );
}

function getOrCreateDb(): BetterSQLite3Database<typeof schema> {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const dbUrl = process.env.DATABASE_URL || 'file:./data/recoverai.db';
  if (!dbUrl.startsWith('file:')) {
    throw new Error(
      `[db] Unsupported DATABASE_URL scheme: "${dbUrl.split(':')[0]}:". ` +
        `This build targets better-sqlite3 and accepts only "file:" URLs.`
    );
  }
  const dbPath = dbUrl.replace(/^file:/, '');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = globalForDb.sqlite ?? new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const legacyGeneration = detectLegacyGeneration(sqlite);
  if (legacyGeneration !== null) {
    clearIndexesCreatedAfter(sqlite, legacyGeneration);
    stampLegacyGeneration(sqlite, legacyGeneration);
  }

  const dbInstance = drizzle(sqlite, { schema });

  // Migrations are the single source of schema truth. Applying them on connect keeps the
  // zero-config promise (no separate `db:migrate` step) while letting an existing database
  // actually converge, which `CREATE TABLE IF NOT EXISTS` could never do.
  migrate(dbInstance, { migrationsFolder: MIGRATIONS_FOLDER });

  globalForDb.sqlite = sqlite;
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
