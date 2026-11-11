import type { DatabaseSync } from 'node:sqlite';

// The people and labs every contract test starts from. Only tables of migration 001.
export const TOKENS = {
  alice: 'tok-alice', // student, class 1
  bob: 'tok-bob', // student, class 1
  carol: 'tok-carol', // student, class 2 — not in lab 1's class
  tara: 'tok-tara', // TA of class 1
  root: 'tok-root', // admin
} as const;

export const LAB = { open: 1, closed: 2, otherClass: 3, missing: 999 } as const;

export function seed(db: DatabaseSync) {
  db.exec(`
    INSERT INTO users (id, name, role, token) VALUES
      (1001, 'Alice', 'student', '${TOKENS.alice}'),
      (1002, 'Bob',   'student', '${TOKENS.bob}'),
      (1003, 'Carol', 'student', '${TOKENS.carol}'),
      (2001, 'Tara',  'ta',      '${TOKENS.tara}'),
      (3001, 'Root',  'admin',   '${TOKENS.root}');
    INSERT INTO classes (id, name) VALUES (1, 'CS101 group 1'), (2, 'CS101 group 2');
    INSERT INTO class_members (class_id, user_id) VALUES (1, 1001), (1, 1002), (2, 1003), (1, 2001);
    INSERT INTO labs (id, class_id, title, deadline_at) VALUES
      (${LAB.open},       1, 'Sorting',   '2999-12-31T23:59:59.999Z'),
      (${LAB.closed},     1, 'Recursion', '2000-01-01T00:00:00.000Z'),
      (${LAB.otherClass}, 2, 'Sorting',   '2999-12-31T23:59:59.999Z');
  `);
}
