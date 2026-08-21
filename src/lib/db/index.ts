import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Ensure the directory for the database file exists
const dbUrl = process.env.DATABASE_URL || 'file:./data/recoverai.db';
const dbPath = dbUrl.replace(/^file:/, '');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);

// Enable WAL mode + serialized writes for concurrency / reliability (Phase 7.6)
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export type DbClient = typeof db;
