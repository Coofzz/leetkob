// The API and the worker are two processes on one database file and start at the same time after a
// deployment: migrations must run exactly once, whoever gets there first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const openInChild = (path: string) =>
  new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { openDb } from './src/db.ts'; openDb(${JSON.stringify(path)}).close();`,
      ],
      { stdio: 'ignore' },
    );
    child.on('close', (code) => resolve(code ?? 1));
  });

test('four processes opening a new database at once: no error, each migration applied once', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'race-')), 'race.db');
  const codes = await Promise.all([1, 2, 3, 4].map(() => openInChild(path)));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  const db = new DatabaseSync(path);
  const applied = db
    .prepare('SELECT name FROM schema_migrations ORDER BY name')
    .all()
    .map((r) => String(r.name));
  db.close();
  const expected = readdirSync('migrations')
    .filter((f) => f.endsWith('.up.sql'))
    .map((f) => f.replace('.up.sql', ''))
    .sort();
  assert.deepEqual(applied, expected);
});
