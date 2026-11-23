// Creates or updates classes, accounts and class membership from a JSON file — the admin's job
// (FAQ-01). It never creates a lab: TAs do that through POST /classes/{classId}/labs.
//
//   npm run accounts -- data/accounts.json        (data/ is git-ignored: real passwords stay out of git)
//
// File format: see docs/accounts.example.json. Running it again updates names, roles, passwords and
// memberships; it never deletes anything.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDb } from '../src/db.ts';
import { hashPassword } from '../src/passwords.ts';

interface AccountsFile {
  classes: { id: number; name: string }[];
  users: {
    username: string;
    name: string;
    role: 'admin' | 'ta' | 'student';
    password: string;
    classes?: number[];
  }[];
}

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run accounts -- <accounts.json>');
  process.exit(2);
}
const spec = JSON.parse(readFileSync(file, 'utf8')) as AccountsFile;
const db = openDb();

db.exec('BEGIN IMMEDIATE');
try {
  const upsertClass = db.prepare(
    'INSERT INTO classes (id, name) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name',
  );
  for (const c of spec.classes) upsertClass.run(c.id, c.name);

  const byUsername = db.prepare('SELECT id FROM users WHERE username = ?');
  const insertUser = db.prepare(
    'INSERT INTO users (name, role, token, username, password_hash) VALUES (?, ?, ?, ?, ?)',
  );
  const updateUser = db.prepare('UPDATE users SET name = ?, role = ?, password_hash = ? WHERE id = ?');
  const addMember = db.prepare('INSERT OR IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)');

  for (const u of spec.users) {
    if (!['admin', 'ta', 'student'].includes(u.role))
      throw new Error(`${u.username}: unknown role ${u.role}`);
    if (u.password.length < 8) throw new Error(`${u.username}: use a password of at least 8 characters`);
    const existing = byUsername.get(u.username) as { id: number } | undefined;
    let id: number;
    if (existing) {
      id = Number(existing.id);
      updateUser.run(u.name, u.role, hashPassword(u.password), id);
    } else {
      // The token column is required; a sign-in replaces this random one.
      const token = randomBytes(32).toString('hex');
      id = Number(
        insertUser.run(u.name, u.role, token, u.username, hashPassword(u.password)).lastInsertRowid,
      );
    }
    for (const classId of u.classes ?? []) addMember.run(classId, id);
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error((err as Error).message);
  process.exit(1);
}
console.error(`accounts: ${spec.classes.length} classes, ${spec.users.length} users`);
