-- docs/contract/post-lab-submissions.md §4: one row per submission accepted.
CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY,
  lab_id       INTEGER NOT NULL REFERENCES labs(id),
  student_id   INTEGER NOT NULL REFERENCES users(id),
  language     TEXT    NOT NULL CHECK (language = 'cpp'),
  code         TEXT    NOT NULL,
  code_bytes   INTEGER NOT NULL CHECK (code_bytes BETWEEN 1 AND 65536),
  status       TEXT    NOT NULL DEFAULT 'queued',
  submitted_at TEXT    NOT NULL
);
CREATE INDEX submissions_lab_student ON submissions (lab_id, student_id);

-- §5: a key belongs to one student. Only a 201 is stored, in the same transaction as the submission.
-- The PRIMARY KEY is the last guard: two requests racing on one key cannot both win.
CREATE TABLE idempotency_keys (
  student_id  INTEGER NOT NULL REFERENCES users(id),
  key         TEXT    NOT NULL,
  fingerprint TEXT    NOT NULL,           -- sha256 of the body in canonical JSON (keys sorted)
  status      INTEGER NOT NULL,
  location    TEXT    NOT NULL,
  body        TEXT    NOT NULL,           -- the exact response body that was sent
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (student_id, key)
);

-- §5 409: requests still being processed. In the database, not in memory, so a second instance sees them.
CREATE TABLE idempotency_in_flight (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,  -- arrival order: the first request owns the key
  student_id INTEGER NOT NULL,
  key        TEXT    NOT NULL,
  started_at INTEGER NOT NULL                    -- epoch ms; rows older than 60 s are ignored (crashed process)
);
CREATE INDEX idempotency_in_flight_key ON idempotency_in_flight (student_id, key);
