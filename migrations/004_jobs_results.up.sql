-- PA#3: the judging queue and its results (docs/decisions/pa3-architecture.md §1, §2, §9).

-- One job per submission, inserted in the same transaction as the submission. A worker claims a job
-- with a lease; a job whose lease ran out may be claimed again, up to 3 attempts.
CREATE TABLE jobs (
  id            INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id),
  status        TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,                      -- epoch ms; the lease of the worker running it
  worker        TEXT,
  last_error    TEXT,                         -- a fixed sentence, never a stack or a path
  created_at    TEXT    NOT NULL,
  finished_at   TEXT
);
CREATE INDEX jobs_ready ON jobs (status, locked_until);

-- The sandbox's result. The PRIMARY KEY is what makes a retried job leave one result.
CREATE TABLE judge_results (
  submission_id  INTEGER PRIMARY KEY REFERENCES submissions(id),
  status         TEXT    NOT NULL,            -- accepted, wrong_answer, time_limit, …
  compile_stderr TEXT,
  tests_json     TEXT    NOT NULL,            -- [{ "idx", "verdict", "timeMs" }]; no input, no output
  judged_at      TEXT    NOT NULL
);

-- The constraint review of an Accepted submission. Only the TA's review queue reads it (FAQ-08).
CREATE TABLE constraint_verdicts (
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  constraint_id TEXT    NOT NULL,
  verdict       TEXT    NOT NULL CHECK (verdict IN ('pass', 'violation', 'unsure')),
  evidence_json TEXT    NOT NULL,             -- [{ "line", "text" }], original source lines
  source        TEXT    NOT NULL CHECK (source IN ('hard-rule', 'model')),
  unsure_reason TEXT,                         -- FAQ-09
  reason        TEXT,
  created_at    TEXT    NOT NULL,
  PRIMARY KEY (submission_id, constraint_id)
);

-- Submissions made before this migration are still waiting: give each one a job.
INSERT INTO jobs (submission_id, status, created_at)
  SELECT id, 'queued', submitted_at FROM submissions WHERE status = 'queued';
