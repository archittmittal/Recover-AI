import { defineConfig } from 'drizzle-kit';

/**
 * One config, two targets (RA-28).
 *
 * `file:` keeps the SQLite dialect used to generate every existing migration; a `libsql://` or
 * `https://` URL switches to the Turso dialect so `drizzle-kit migrate` can apply those same
 * migrations to the deployed database. The scheme is the only switch — there is no second config
 * file to forget to update.
 */
const url = process.env.DATABASE_URL || 'file:./data/recoverai.db';
const isRemote = url.startsWith('libsql://') || url.startsWith('https://');

export default defineConfig(
  isRemote
    ? {
        schema: './src/lib/db/schema.ts',
        out: './src/lib/db/migrations',
        dialect: 'turso',
        dbCredentials: {
          url,
          authToken: process.env.DATABASE_AUTH_TOKEN,
        },
      }
    : {
        schema: './src/lib/db/schema.ts',
        out: './src/lib/db/migrations',
        dialect: 'sqlite',
        dbCredentials: { url: url.replace(/^file:/, '') },
      }
);
