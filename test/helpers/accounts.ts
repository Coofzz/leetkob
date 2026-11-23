import type { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../../src/passwords.ts';

// On top of seed.ts: passwords for sign-in, and a TA of class 2 (the "TA of another class").
export const PASSWORDS = {
  alice: 'alice-pass-1',
  tara: 'tara-pass-1',
  root: 'root-pass-1',
} as const;

export const TIM_TOKEN = 'tok-tim'; // TA of class 2 only

export function seedAccounts(db: DatabaseSync) {
  const setLogin = db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?');
  setLogin.run('alice', hashPassword(PASSWORDS.alice), 1001);
  setLogin.run('tara', hashPassword(PASSWORDS.tara), 2001);
  setLogin.run('root', hashPassword(PASSWORDS.root), 3001);
  db.exec(`
    INSERT INTO users (id, name, role, token) VALUES (2002, 'Tim', 'ta', '${TIM_TOKEN}');
    INSERT INTO class_members (class_id, user_id) VALUES (2, 2002);
  `);
}
