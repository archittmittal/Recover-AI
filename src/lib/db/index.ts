import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle as drizzleLibsql, LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

/**
 * Two drivers, chosen by URL scheme (RA-28).
 *
 * `better-sqlite3` writes to a local file, which is the right thing for development and
 * completely wrong for a serverless deployment: the filesystem is ephemeral and per-instance, so
 * a Vercel deploy would appear to work and then silently lose data mid-demo. `libsql:`/`https:`
 * URLs therefore go to a Turso client instead.
 *
 * Local behaviour is deliberately untouched — same driver, same WAL pragma, same
 * migrate-on-connect, same legacy adoption — so the zero-config story still holds.
 */
type SchemaDatabase = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;

const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
  db: SchemaDatabase | undefined;
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
  EXPERIMENT_ARMS: 5,      // 0005 — payment_failures.arm/simulation_key, recovery_journeys.arm
  NULLABLE_AUDIT_JOURNEY: 6, // 0006 — audit_logs.journey_id becomes nullable
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

  const columnInfo = (table: string, column: string): { name: string; notnull: number } | undefined =>
    (sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[]).find(
      (c) => c.name === column
    );

  const hasColumn = (table: string, column: string): boolean => columnInfo(table, column) !== undefined;

  // 0006 adds no column — it relaxes one. A generation probe therefore has to read the
  // constraint rather than the column list, or every database would look pre-0006 forever and
  // the table rebuild would replay on each boot.
  const isNullable = (table: string, column: string): boolean => columnInfo(table, column)?.notnull === 0;

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
  if (isNullable('audit_logs', 'journey_id')) return when[GEN.NULLABLE_AUDIT_JOURNEY];
  if (hasColumn('recovery_journeys', 'arm')) return when[GEN.EXPERIMENT_ARMS];
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
  const when = generationTimestamps();

  // Grouped by the migration that creates them. Dropping an index whose migration is ALREADY
  // marked applied would lose it permanently — nothing would ever recreate it — so each group
  // is cleared only when its own migration is still pending for this database.
  const createdByGeneration: { createdAt: number; names: string[] }[] = [
    {
      createdAt: when[GEN.PERF_INDEXES],
      names: [
        'idx_audit_journey',
        'idx_failures_customer',
        'idx_actions_journey',
        'idx_journeys_customer',
        'idx_journeys_failure',
      ],
    },
    {
      createdAt: when[GEN.EXPERIMENT_ARMS],
      names: ['idx_failures_arm', 'idx_journeys_arm'],
    },
  ];

  for (const group of createdByGeneration) {
    if (generation >= group.createdAt) continue;
    for (const name of group.names) {
      sqlite.exec(`DROP INDEX IF EXISTS ${name}`);
    }
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

/** How a DATABASE_URL is served. Exported so tests and the deploy check can assert on it. */
export type DbDriver = 'better-sqlite3' | 'libsql';

export function resolveDriver(dbUrl: string): DbDriver {
  if (dbUrl.startsWith('file:')) return 'better-sqlite3';
  if (dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://')) return 'libsql';

  // Loudly, rather than mangling it into a filename. The old code stripped a `file:` prefix that
  // was not there and handed `libsql://…` to better-sqlite3, which dutifully created a local
  // file with that name — the documented Turso deployment "worked" and wrote to nowhere.
  throw new Error(
    `[db] Unsupported DATABASE_URL scheme: "${dbUrl.split(':')[0]}:". ` +
      `Use "file:" for a local SQLite file, or "libsql://" / "https://" for Turso.`
  );
}

/** Local file database: unchanged from before RA-28, including migrate-on-connect. */
function createLocalDb(dbUrl: string): SchemaDatabase {
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

  const dbInstance: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

  // Migrations are the single source of schema truth. Applying them on connect keeps the
  // zero-config promise (no separate `db:migrate` step) while letting an existing database
  // actually converge, which `CREATE TABLE IF NOT EXISTS` could never do.
  migrate(dbInstance, { migrationsFolder: MIGRATIONS_FOLDER });

  globalForDb.sqlite = sqlite;
  return dbInstance;
}

/**
 * Remote libSQL/Turso database.
 *
 * Migrations are NOT applied here. On a serverless host every cold start would race every other
 * cold start to run them, against a database they all share — and a migration is not something to
 * attempt concurrently from an unknown number of instances. `npm run db:migrate` applies them
 * once at deploy time instead; `docs/DEPLOYMENT.md` documents that step, and
 * `verifyRemoteSchema()` below turns a forgotten one into a clear error rather than a confusing
 * "no such table" at the first request.
 */
function createRemoteDb(dbUrl: string): SchemaDatabase {
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  if (!authToken) {
    throw new Error(
      '[db] DATABASE_URL points at a remote libSQL database but DATABASE_AUTH_TOKEN is unset. ' +
        'Create a token with `turso db tokens create <database>`.'
    );
  }

  const client = createClient({ url: dbUrl, authToken });
  const dbInstance: LibSQLDatabase<typeof schema> = drizzleLibsql(client, { schema });
  return dbInstance;
}

function getOrCreateDb(): SchemaDatabase {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const dbUrl = process.env.DATABASE_URL || 'file:./data/recoverai.db';
  const driver = resolveDriver(dbUrl);

  const dbInstance = driver === 'libsql' ? createRemoteDb(dbUrl) : createLocalDb(dbUrl);

  globalForDb.db = dbInstance;
  return dbInstance;
}

/**
 * Confirms a remote database has actually had migrations applied.
 *
 * Called by `npm run db:verify` and by the deployment guide, so "I forgot the migrate step"
 * surfaces as a sentence naming the fix instead of a `no such table: customers` at the first
 * dashboard request.
 */
export async function verifyRemoteSchema(): Promise<{ applied: number; tables: string[] }> {
  const dbUrl = process.env.DATABASE_URL || '';
  if (resolveDriver(dbUrl) !== 'libsql') {
    throw new Error('[db] verifyRemoteSchema is only meaningful for a libsql:// DATABASE_URL.');
  }

  const client = createClient({ url: dbUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  const names = tables.rows.map((r) => String(r.name));

  if (!names.includes(MIGRATIONS_TABLE)) {
    throw new Error(
      `[db] The remote database has no ${MIGRATIONS_TABLE} table — migrations have never been ` +
        'applied. Run `npm run db:migrate` with DATABASE_URL and DATABASE_AUTH_TOKEN set.'
    );
  }

  const applied = await client.execute(`SELECT COUNT(*) AS n FROM ${MIGRATIONS_TABLE}`);
  return { applied: Number(applied.rows[0]?.n ?? 0), tables: names };
}

export const db = new Proxy({} as SchemaDatabase, {
  get(_target, prop) {
    const instance = getOrCreateDb();
    const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(instance) : val;
  },
});

export type DbClient = SchemaDatabase;
