import { it, expect } from 'vitest';
import { db } from '../../src/lib/db';
import { customers } from '../../src/lib/db/schema';

/**
 * Paired with db-isolation-{1,2}: each test FILE must get its own database.
 *
 * Both files insert a row with the same primary key. If they ever shared a database — a
 * reused Vitest worker carrying a stale DATABASE_URL, or the globalThis connection cache
 * leaking across files — the second to run would see a non-empty table and fail its primary
 * key insert. Verified to hold under the default pool and under --no-isolate --pool=threads.
 */
it('starts with an empty database of its own', async () => {
  expect(await db.select().from(customers)).toHaveLength(0);
  await db.insert(customers).values({
    id: 'shared_pk', name: 'iso2', email: 'iso2@example.com', phone: '+919000000000',
    preferredLanguage: 'en', segment: 'retail', createdAt: 'x', updatedAt: 'x',
  } as never);
  expect(await db.select().from(customers)).toHaveLength(1);
});
