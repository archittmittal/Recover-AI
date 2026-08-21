import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: (process.env.DATABASE_URL || 'file:./data/recoverai.db').replace(/^file:/, ''),
  },
});
