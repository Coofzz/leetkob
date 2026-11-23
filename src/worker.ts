// The worker: a process of its own (`npm run worker`), separate from the API. It claims jobs from the
// queue, judges each submission in the sandbox, and reviews the constraints of an Accepted submission
// that is still its student's latest (FAQ-02). docs/decisions/pa3-architecture.md §1, §2, §9.
//
// Exactly once: results are written with INSERT … ON CONFLICT DO NOTHING on keys that allow one result
// per submission (and one verdict per constraint), and a stored judge result is reused, not re-judged.
//
//   npm run worker                       MODEL_OFF=1 → hard rules only; otherwise LLM_API_KEY is required
//   Environment: DATABASE_PATH, MODEL_OFF, LLM_API_KEY, LLM_MODEL, LLM_TIMEOUT_MS, CALLS_LOG
import { hostname } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { appendCall } from './checker/call-log.ts';
import { createGeminiClient } from './checker/gemini.ts';
import { createReview } from './checker/review.ts';
import { createSemanticReview } from './checker/semantic.ts';
import { openDb } from './db.ts';
import { claimJob, finishJob, noteFailure, type Job } from './queue.ts';
import { judge as sandboxJudge } from './sandbox/runner.ts';
import type { JudgeFn, ReviewFn } from './types.ts';

export interface WorkerDeps {
  judge: JudgeFn;
  review: ReviewFn;
  modelOff: boolean;
  /** Told which submission is about to be reviewed (for the call log). */
  reviewing?: (submissionId: number) => void;
}

interface SubmissionRow {
  id: number;
  lab_id: number;
  student_id: number;
  code: string;
  status: string;
  statement: string;
  cpu_ms: number;
  memory_mb: number;
}

export async function processJob(db: DatabaseSync, job: Job, deps: WorkerDeps): Promise<void> {
  const sub = db
    .prepare(
      `SELECT s.id, s.lab_id, s.student_id, s.code, s.status, l.statement, l.cpu_ms, l.memory_mb
         FROM submissions s JOIN labs l ON l.id = s.lab_id WHERE s.id = ?`,
    )
    .get(job.submissionId) as SubmissionRow | undefined;
  if (!sub) {
    finishJob(db, job.id);
    return;
  }
  if (sub.status === 'queued')
    db.prepare("UPDATE submissions SET status = 'judging' WHERE id = ?").run(sub.id);

  // 1. Judge, unless an earlier attempt already stored the result.
  const storedResult = () =>
    db.prepare('SELECT status FROM judge_results WHERE submission_id = ?').get(sub.id) as
      { status: string } | undefined;
  let result = storedResult();
  if (!result) {
    const tests = db
      .prepare('SELECT input, expected_output FROM lab_tests WHERE lab_id = ? ORDER BY idx')
      .all(sub.lab_id)
      .map((t) => ({ input: String(t.input), expected: String(t.expected_output) }));
    const judged = await deps.judge({
      jobId: `s${sub.id}-a${job.attempt}`,
      source: sub.code,
      tests,
      cpuMs: Number(sub.cpu_ms),
      memoryMb: Number(sub.memory_mb),
    });
    db.prepare(
      `INSERT INTO judge_results (submission_id, status, compile_stderr, tests_json, judged_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (submission_id) DO NOTHING`,
    ).run(
      sub.id,
      judged.status,
      judged.compileStderr ?? null,
      JSON.stringify(judged.tests),
      new Date().toISOString(),
    );
    result = storedResult();
  }
  db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(result?.status ?? 'system_error', sub.id);

  // 2. Review the constraints: only an Accepted submission that is still the student's latest.
  const constraints = db
    .prepare('SELECT constraint_id, text FROM lab_constraints WHERE lab_id = ? ORDER BY position')
    .all(sub.lab_id)
    .map((c) => ({ id: String(c.constraint_id), text: String(c.text) }));
  const superseded = db
    .prepare('SELECT 1 FROM submissions WHERE lab_id = ? AND student_id = ? AND id > ? LIMIT 1')
    .get(sub.lab_id, sub.student_id, sub.id);
  const alreadyReviewed = db
    .prepare('SELECT 1 FROM constraint_verdicts WHERE submission_id = ? LIMIT 1')
    .get(sub.id);
  if (result?.status === 'accepted' && constraints.length > 0 && !superseded && !alreadyReviewed) {
    deps.reviewing?.(sub.id);
    const verdicts = await deps.review(
      { statement: sub.statement, constraints, source: sub.code },
      { modelOff: deps.modelOff },
    );
    const insert = db.prepare(
      `INSERT INTO constraint_verdicts
         (submission_id, constraint_id, verdict, evidence_json, source, unsure_reason, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (submission_id, constraint_id) DO NOTHING`,
    );
    const at = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const v of verdicts) {
        insert.run(
          sub.id,
          v.constraint,
          v.verdict,
          JSON.stringify(v.evidence),
          v.source,
          v.unsureReason ?? null,
          v.reason ?? null,
          at,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  finishJob(db, job.id);
}

/** Claims and processes one job. Returns false when there was nothing to do. */
export async function runOnce(db: DatabaseSync, deps: WorkerDeps, worker: string): Promise<boolean> {
  const job = claimJob(db, worker);
  if (!job) return false;
  try {
    await processJob(db, job, deps);
  } catch (err) {
    // The job stays claimed until its lease runs out; then a worker tries again (up to MAX_ATTEMPTS).
    noteFailure(db, job.id, 'the attempt failed; it will be retried');
    console.error(`job ${job.id} (submission ${job.submissionId}) attempt ${job.attempt} failed:`, err);
  }
  return true;
}

function depsFromEnv(env: NodeJS.ProcessEnv): WorkerDeps {
  const modelOff = env.MODEL_OFF === '1';
  if (modelOff) return { judge: sandboxJudge, review: createReview(), modelOff };
  if (!env.LLM_API_KEY) throw new Error('LLM_API_KEY is not set: set it, or run the worker with MODEL_OFF=1');
  const timeoutMs = Number(env.LLM_TIMEOUT_MS) || 60_000;
  const callsLog = env.CALLS_LOG || 'data/calls.jsonl';
  let current = 0;
  const review = createReview(
    createSemanticReview({
      client: createGeminiClient({
        apiKey: env.LLM_API_KEY,
        model: env.LLM_MODEL || 'gemini-2.5-flash',
        timeoutMs,
      }),
      timeoutMs,
      onCall: (entry) => appendCall(callsLog, { submission: `submission ${current}`, ...entry }),
    }),
  );
  return { judge: sandboxJudge, review, modelOff, reviewing: (id) => (current = id) };
}

async function main() {
  const deps = depsFromEnv(process.env);
  const db = openDb();
  const name = `${hostname()}:${process.pid}`;
  let stopping = false;
  const stop = () => {
    stopping = true; // finish the job in hand, then exit
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.error(`worker ${name} started (${deps.modelOff ? 'MODEL_OFF: hard rules only' : 'model on'})`);
  while (!stopping) {
    const worked = await runOnce(db, deps, name);
    if (!worked && !stopping) await new Promise((r) => setTimeout(r, 500));
  }
  db.close();
  console.error(`worker ${name} stopped`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  });
}
