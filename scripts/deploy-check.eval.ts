/**
 * Deployment verification for a remote libSQL/Turso database (RA-28).
 *
 * Usage:
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:verify
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… SEED=1 npm run db:verify
 *
 * Answers the two questions a deploy actually fails on — "did the migrations run?" and "is there
 * any data?" — because both surface otherwise as an unexplained `no such table: customers` at the
 * first dashboard request, several minutes after the deploy appeared to succeed.
 *
 * Runs under Vitest for the same reason `evaluate-arms.eval.ts` does: the application's modules
 * use the `@/` path alias and extensionless imports that only the project toolchain resolves.
 */

import { it } from 'vitest';

it('verifies the deployed database', async () => {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
    throw new Error(
      `Set DATABASE_URL to your Turso database first. Got "${url || '(unset)'}".\n` +
        'This check is for a deployed database; local files migrate themselves on connect.'
    );
  }

  const { verifyRemoteSchema } = await import('../src/lib/db');
  const { applied, tables } = await verifyRemoteSchema();

  console.log(`\nmigrations applied: ${applied}`);
  console.log(`tables: ${tables.join(', ')}\n`);

  const expected = [
    'customers',
    'payment_failures',
    'recovery_journeys',
    'recovery_actions',
    'audit_logs',
    'webhook_events',
  ];
  const missing = expected.filter((t) => !tables.includes(t));
  if (missing.length > 0) {
    throw new Error(
      `Missing tables: ${missing.join(', ')}. Run \`npm run db:migrate\` against this database.`
    );
  }

  const { db } = await import('../src/lib/db');
  const { customers } = await import('../src/lib/db/schema');
  const rows = await db.select().from(customers);
  console.log(`customers currently in the deployed database: ${rows.length}`);

  if (process.env.SEED === '1') {
    const { seedDatabase } = await import('../src/lib/db/seed');
    const count = await seedDatabase();
    console.log(`seeded ${count} failures across the three experiment arms`);
  } else if (rows.length === 0) {
    console.log('empty — re-run with SEED=1 to populate the demo batch');
  }

  console.log('\n✓ deployed database is migrated and reachable\n');
}, 10 * 60 * 1000);
