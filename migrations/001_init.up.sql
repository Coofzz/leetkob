-- Accounts, classes, labs. Roles: admin, ta, student (brief §4.1).
CREATE TABLE users (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL CHECK (role IN ('admin', 'ta', 'student')),
  token TEXT NOT NULL UNIQUE          -- PA#2 stand-in for real login: Authorization: Bearer <token>
);
CREATE TABLE classes (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
-- Who belongs to which class: TAs teach it, students are enrolled in it.
CREATE TABLE class_members (
  class_id INTEGER NOT NULL REFERENCES classes(id),
  user_id  INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (class_id, user_id)
);
CREATE TABLE labs (
  id          INTEGER PRIMARY KEY,
  class_id    INTEGER NOT NULL REFERENCES classes(id),
  title       TEXT NOT NULL,
  deadline_at TEXT NOT NULL            -- ISO 8601, UTC
);
