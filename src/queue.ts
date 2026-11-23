// The judging queue: a table in the same SQLite database (docs/decisions/pa3-architecture.md §1).
// A worker claims the oldest ready job in one statement, so two workers never get the same job.
import type { DatabaseSync } from 'node:sqlite';

export const LEASE_MS = 2 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

export interface Job {
  id: number;
  submissionId: number;
  attempt: number;
}

/** Called inside the transaction that creates the submission. */
export function enqueue(db: DatabaseSync, submissionId: number, createdAt: string): void {
  db.prepare('INSERT INTO jobs (submission_id, status, created_at) VALUES (?, ?, ?)').run(
    submissionId,
    'queued',
    createdAt,
  );
}

/**
 * Claims one ready job for `worker` until now + LEASE_MS, or returns null. Ready: queued, or running
 * with an expired lease (its worker died). A job out of attempts is marked failed instead.
 */
export function claimJob(db: DatabaseSync, worker: string, now = Date.now()): Job | null {
  db.exec('BEGIN IMMEDIATE');
  try {
    const exhausted = db
      .prepare(
        `UPDATE jobs SET status = 'failed', finished_at = ?, last_error = COALESCE(last_error, 'gave up')
          WHERE status = 'running' AND locked_until < ? AND attempts >= ?
          RETURNING submission_id`,
      )
      .all(new Date(now).toISOString(), now, MAX_ATTEMPTS);
    const markError = db.prepare("UPDATE submissions SET status = 'system_error' WHERE id = ?");
    for (const row of exhausted) markError.run(Number(row.submission_id));

    const row = db
      .prepare(
        `UPDATE jobs SET status = 'running', worker = ?, locked_until = ?, attempts = attempts + 1
          WHERE id = (SELECT id FROM jobs
                       WHERE status = 'queued'
                          OR (status = 'running' AND locked_until < ? AND attempts < ?)
                       ORDER BY id LIMIT 1)
          RETURNING id, submission_id, attempts`,
      )
      .get(worker, now + LEASE_MS, now, MAX_ATTEMPTS) as
      { id: number; submission_id: number; attempts: number } | undefined;
    db.exec('COMMIT');
    return row
      ? { id: Number(row.id), submissionId: Number(row.submission_id), attempt: Number(row.attempts) }
      : null;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function finishJob(db: DatabaseSync, jobId: number): void {
  db.prepare("UPDATE jobs SET status = 'done', locked_until = NULL, finished_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    jobId,
  );
}

/** Records why an attempt failed; the job stays claimed until its lease runs out, then is retried. */
export function noteFailure(db: DatabaseSync, jobId: number, sentence: string): void {
  db.prepare('UPDATE jobs SET last_error = ? WHERE id = ?').run(sentence, jobId);
}
