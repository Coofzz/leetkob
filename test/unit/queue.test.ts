// The queue and the worker (rubric criterion 2): the request handler only enqueues; a separate worker
// judges. "Stop the worker, submit, start it again, and the submission is judged exactly once" — exactly
// once means one set of results in the database, even if a worker dies half-way and another retries.
// Fakes for the sandbox and the review: no Docker, no model.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS, LAB } from '../helpers/seed.ts';
import { fakeJudge, fakeReview } from '../helpers/fakes.ts';
import { claimJob, LEASE_MS, MAX_ATTEMPTS } from '../../src/queue.ts';
import { processJob, runOnce, type WorkerDeps } from '../../src/worker.ts';
import type { JudgeFn, ReviewFn } from '../../src/types.ts';

let srv: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  srv = await startServer();
  seed(srv.db);
  // Lab 1 gets a statement, two tests and two constraints, as a TA would have created it.
  srv.db.exec(`
    UPDATE labs SET statement = 'Print the sum.' WHERE id = ${LAB.open};
    INSERT INTO lab_tests (lab_id, idx, input, expected_output) VALUES
      (${LAB.open}, 0, '1 2', '3'), (${LAB.open}, 1, '2 2', '4');
    INSERT INTO lab_constraints (lab_id, constraint_id, position, text, deduction) VALUES
      (${LAB.open}, 'C1', 0, 'Do not use \`std::accumulate\`.', 2),
      (${LAB.open}, 'C2', 1, 'Add with a function you wrote yourself.', 3);
  `);
});
afterEach(() => srv.close());

async function submit(token: string = TOKENS.alice): Promise<number> {
  const res = await fetch(`${srv.base}/labs/${LAB.open}/submissions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ language: 'cpp', code: 'int main() { return 0; }\n' }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: number }).id;
}

const count = (sql: string, ...args: (number | string)[]) =>
  Number((srv.db.prepare(sql).get(...args) as { n: number }).n);
const statusOf = (id: number) =>
  (srv.db.prepare('SELECT status FROM submissions WHERE id = ?').get(id) as { status: string }).status;
// node:sqlite rows have a null prototype; copy into a plain object so deepEqual compares values only.
const jobOf = (id: number) => ({
  ...(srv.db.prepare('SELECT status, attempts FROM jobs WHERE submission_id = ?').get(id) as {
    status: string;
    attempts: number;
  }),
});

function counting(judge: JudgeFn = fakeJudge()) {
  let calls = 0;
  const fn: JudgeFn = async (input) => {
    calls++;
    return judge(input);
  };
  return { fn, calls: () => calls };
}
const deps = (over: Partial<WorkerDeps> = {}): WorkerDeps => ({
  judge: fakeJudge(),
  review: fakeReview,
  modelOff: true,
  ...over,
});

test('submitting while no worker runs: the submission and its job are queued, nothing is judged', async () => {
  const id = await submit();
  assert.equal(statusOf(id), 'queued');
  assert.deepEqual(jobOf(id), { status: 'queued', attempts: 0 });
  assert.equal(count('SELECT COUNT(*) AS n FROM judge_results'), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts'), 0);
});

test('the worker started later judges it once, reviews it, and finds nothing more to do', async () => {
  const id = await submit();
  const judge = counting();
  assert.equal(await runOnce(srv.db, deps({ judge: judge.fn }), 'w1'), true);
  assert.equal(judge.calls(), 1);
  assert.equal(statusOf(id), 'accepted');
  assert.equal(jobOf(id).status, 'done');
  assert.equal(count('SELECT COUNT(*) AS n FROM judge_results WHERE submission_id = ?', id), 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts WHERE submission_id = ?', id), 2);
  assert.equal(await runOnce(srv.db, deps({ judge: judge.fn }), 'w1'), false);
  assert.equal(judge.calls(), 1);
});

test('a worker that dies after judging: after its lease another worker finishes, and there is one set of results', async () => {
  const id = await submit();
  const t0 = Date.now();
  const crashingReview: ReviewFn = async () => {
    throw new Error('worker killed');
  };
  const judgeA = counting();
  const jobA = claimJob(srv.db, 'wA', t0);
  assert.ok(jobA);
  await assert.rejects(processJob(srv.db, jobA, deps({ judge: judgeA.fn, review: crashingReview })));
  assert.equal(judgeA.calls(), 1);

  // While A's lease holds, nobody else may take the job.
  assert.equal(claimJob(srv.db, 'wB', t0 + LEASE_MS - 1), null);

  const judgeB = counting();
  const jobB = claimJob(srv.db, 'wB', t0 + LEASE_MS + 1);
  assert.ok(jobB);
  assert.equal(jobB.submissionId, id);
  await processJob(srv.db, jobB, deps({ judge: judgeB.fn }));
  assert.equal(judgeB.calls(), 0, 'the stored judge result is reused, not judged again');
  assert.equal(count('SELECT COUNT(*) AS n FROM judge_results WHERE submission_id = ?', id), 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts WHERE submission_id = ?', id), 2);
  assert.equal(jobOf(id).status, 'done');
});

test('processing the same job twice still leaves one set of results', async () => {
  const id = await submit();
  const job = claimJob(srv.db, 'w1', Date.now());
  assert.ok(job);
  await Promise.all([processJob(srv.db, job, deps()), processJob(srv.db, job, deps())]);
  assert.equal(count('SELECT COUNT(*) AS n FROM judge_results WHERE submission_id = ?', id), 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts WHERE submission_id = ?', id), 2);
});

test('two workers never claim the same job', async () => {
  const a = await submit(TOKENS.alice);
  const b = await submit(TOKENS.bob);
  const now = Date.now();
  const first = claimJob(srv.db, 'w1', now);
  const second = claimJob(srv.db, 'w2', now);
  assert.ok(first && second);
  assert.deepEqual([first.submissionId, second.submissionId].sort(), [a, b].sort());
  assert.equal(claimJob(srv.db, 'w3', now), null);
});

test('a submission that is not accepted is not reviewed', async () => {
  const id = await submit();
  const wrong = fakeJudge(() => ({ status: 'wrong_answer', tests: [{ idx: 0, verdict: 'WA', timeMs: 3 }] }));
  await runOnce(srv.db, deps({ judge: wrong }), 'w1');
  assert.equal(statusOf(id), 'wrong_answer');
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts WHERE submission_id = ?', id), 0);
});

test('an accepted submission that is no longer the student’s latest is not sent for review (FAQ-02)', async () => {
  const older = await submit();
  const newer = await submit();
  let reviewed = 0;
  const review: ReviewFn = async (input, opts) => {
    reviewed++;
    return fakeReview(input, opts);
  };
  await runOnce(srv.db, deps({ review }), 'w1'); // the older one first
  await runOnce(srv.db, deps({ review }), 'w1');
  assert.equal(statusOf(older), 'accepted');
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts WHERE submission_id = ?', older), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM constraint_verdicts WHERE submission_id = ?', newer), 2);
  assert.equal(reviewed, 1);
});

test('a job that keeps failing stops after MAX_ATTEMPTS and the submission is marked as a system error', async () => {
  const id = await submit();
  const broken: JudgeFn = async () => {
    throw new Error('docker is not running');
  };
  let now = Date.now();
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const job = claimJob(srv.db, 'w1', now);
    assert.ok(job, `attempt ${i + 1} should be claimable`);
    await assert.rejects(processJob(srv.db, job, deps({ judge: broken })));
    now += LEASE_MS + 1;
  }
  assert.equal(claimJob(srv.db, 'w1', now), null);
  assert.equal(jobOf(id).status, 'failed');
  assert.equal(statusOf(id), 'system_error');
});

test('the request handler never judges: the API code does not import the sandbox, the checker or the worker', () => {
  for (const file of ['src/app.ts', 'src/submissions.ts', 'src/labs.ts', 'src/auth.ts']) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/from '\.\/(sandbox|checker|worker)/.test(text), `${file} imports judging code`);
  }
  const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> })
    .scripts;
  assert.match(scripts.worker ?? '', /src\/worker\.ts/);
});
