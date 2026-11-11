import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function openDb(path = process.env.DATABASE_PATH || 'data/leetkob.db'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((r) => String(r.name)),
  );
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.up.sql'))
    .sort()) {
    const name = file.replace('.up.sql', '');
    if (applied.has(name)) continue;
    db.exec('BEGIN');
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    db.exec('COMMIT');
  }
  return db;
}
