-- PA#3: sign-in with a password (docs/contract/post-auth-login.md) next to the PA#2 tokens,
-- and what a lab needs to be judged (docs/contract/post-class-labs.md).

-- users.token stays: POST /auth/login writes a fresh one there.
ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;       -- scrypt$<salt hex>$<hash hex>; NULL = cannot sign in
CREATE UNIQUE INDEX users_username ON users (username) WHERE username IS NOT NULL;

ALTER TABLE labs ADD COLUMN statement  TEXT    NOT NULL DEFAULT '';
ALTER TABLE labs ADD COLUMN cpu_ms     INTEGER NOT NULL DEFAULT 1000 CHECK (cpu_ms BETWEEN 1000 AND 5000);  -- FAQ-05
ALTER TABLE labs ADD COLUMN memory_mb  INTEGER NOT NULL DEFAULT 256  CHECK (memory_mb BETWEEN 64 AND 512);  -- FAQ-05
ALTER TABLE labs ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE labs ADD COLUMN created_at TEXT;

-- The tests the sandbox judges against. Students never see them (FAQ-02).
CREATE TABLE lab_tests (
  lab_id          INTEGER NOT NULL REFERENCES labs(id),
  idx             INTEGER NOT NULL,                      -- 0-based, the order the TA gave
  input           TEXT    NOT NULL,
  expected_output TEXT    NOT NULL,
  PRIMARY KEY (lab_id, idx)
);

-- The constraints, with the deduction the TA set. The model never sees or sets a deduction.
CREATE TABLE lab_constraints (
  lab_id        INTEGER NOT NULL REFERENCES labs(id),
  constraint_id TEXT    NOT NULL,
  position      INTEGER NOT NULL,                        -- the order the TA gave
  text          TEXT    NOT NULL,
  deduction     INTEGER NOT NULL CHECK (deduction BETWEEN 0 AND 10),
  PRIMARY KEY (lab_id, constraint_id)
);
