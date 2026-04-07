import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

const DB_PATH = path.join(process.cwd(), 'data', 'projectharbor.db');
const MIGRATIONS_PATH = path.join(process.cwd(), 'data', 'migrations');

let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getSqlite(): Database.Database {
  if (!_sqlite) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _sqlite;
}

export function initDb(): void {
  if (_sqlite) return; // Already initialized

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _sqlite = new Database(DB_PATH);

  // WAL mode for better concurrent read performance
  _sqlite.pragma('journal_mode = WAL');

  // Enforce foreign key constraints
  _sqlite.pragma('foreign_keys = ON');

  // Optimize for writes
  _sqlite.pragma('synchronous = NORMAL');
  _sqlite.pragma('cache_size = -32000'); // 32MB cache

  _db = drizzle(_sqlite, { schema });

  // Run migrations if migrations directory exists
  if (fs.existsSync(MIGRATIONS_PATH)) {
    try {
      migrate(_db, { migrationsFolder: MIGRATIONS_PATH });
      console.log('[db] Migrations applied');
    } catch (err) {
      console.warn('[db] Migration warning:', err);
    }
  }

  console.log(`[db] Connected: ${DB_PATH}`);
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    console.log('[db] Closed');
  }
}

// Convenience getter — throws if not initialized
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle<typeof schema>>];
  },
});
