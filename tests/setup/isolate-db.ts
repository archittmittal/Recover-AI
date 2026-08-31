import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

/**
 * Every test file gets its own database.
 *
 * Vitest runs files in separate workers, so this executes once per file and the path is
 * unique per worker. Files that set DATABASE_URL themselves keep their own value — this only
 * supplies a default, so no test silently falls through to ./data/recoverai.db.
 *
 * That fallthrough is what let tests pass or fail based on the developer's local database
 * rather than on the code under test.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoverai-test-'));
const dbPath = path.join(dir, `${crypto.randomUUID()}.db`);

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${dbPath}`;
}

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
