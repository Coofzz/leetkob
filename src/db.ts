import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function openDb(path = process.env.DATABASE_PATH || 'data/leetkob.db'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  // The API and the worker are two processes on one file: wait for each other's writes, and let
  // readers go on while one writes.
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.up.sql'))
    .sort()) {
    const name = file.replace('.up.sql', '');
    // Take the write lock first, then check: when the API and the worker start together, the second
    // waits for the first and then sees its migration as applied instead of running it again.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)) {
        db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}
