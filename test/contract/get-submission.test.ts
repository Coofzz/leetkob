// Contract tests for docs/contract/get-submission.md.
// Written from the contract, not from the code: each test name starts with the section it checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS, LAB } from '../helpers/seed.ts';
import { seedAccounts, TIM_TOKEN } from '../helpers/accounts.ts';

const PROBLEM = 'https://leetkob.example/problems/';
const SECRET_INPUT = 'hidden-input-7731';
const SECRET_OUTPUT = 'hidden-output-7731';
const EVIDENCE = '  std::sort(a, a + n); // evidence line';

let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
  seed(srv.db);
  seedAccounts(srv.db);
  srv.db.exec(`
    INSERT INTO lab_tests (lab_id, idx, input, expected_output) VALUES
      (${LAB.open}, 0, '${SECRET_INPUT}', '${SECRET_OUTPUT}'), (${LAB.open}, 1, '2', '4');
    INSERT INTO lab_constraints (lab_id, constraint_id, position, text, deduction) VALUES
      (${LAB.open}, 'C1', 0, 'Do not call \`std::sort\`.', 3);
  `);
});
after(() => srv.close());

async function submitAs(token: string): Promise<number> {
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

/** What the worker would store once the submission is judged (and reviewed, when Accepted). */
function judged(
  id: number,
  status: string,
  tests: { idx: number; verdict: string; timeMs: number }[],
  stderr?: string,
) {
  srv.db
    .prepare(
      `INSERT INTO judge_results (submission_id, status, compile_stderr, tests_json, judged_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, status, stderr ?? null, JSON.stringify(tests), new Date().toISOString());
  srv.db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(status, id);
}
function reviewed(id: number) {
  srv.db
    .prepare(
      `INSERT INTO constraint_verdicts
         (submission_id, constraint_id, verdict, evidence_json, source, unsure_reason, reason, created_at)
       VALUES (?, 'C1', 'violation', ?, 'hard-rule', NULL, NULL, ?)`,
    )
    .run(id, JSON.stringify([{ line: 1, text: EVIDENCE }]), new Date().toISOString());
}

async function get(id: number | string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${srv.base}/submissions/${id}`, { headers });
  const text = await res.text();
  return { res, status: res.status, text, body: text ? JSON.parse(text) : null };
}

function expectProblem(r: Awaited<ReturnType<typeof get>>, status: number, type: string) {
  assert.equal(r.status, status, `expected ${status} ${type}, got ${r.status} ${r.text}`);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  assert.equal(r.body.type, PROBLEM + type);
}

// §3 — who may see it

test('§1 no Authorization header is 401 unauthenticated with WWW-Authenticate: Bearer', async () => {
  const id = await submitAs(TOKENS.alice);
  const r = await get(id, null);
  expectProblem(r, 401, 'unauthenticated');
  assert.equal(r.res.headers.get('www-authenticate'), 'Bearer');
});

test('§3 the student who submitted it, a TA of the class and an admin may see it', async () => {
  const id = await submitAs(TOKENS.alice);
  for (const token of [TOKENS.alice, TOKENS.tara, TOKENS.root]) {
    const r = await get(id, token);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.id, id);
  }
});

test('§3 another student (same class or not) and a TA of another class get the same 404 as a missing one', async () => {
  const id = await submitAs(TOKENS.alice);
  const missing = await get(999_999, TOKENS.alice);
  expectProblem(missing, 404, 'not-found');
  for (const token of [TOKENS.bob, TOKENS.carol, TIM_TOKEN]) {
    const r = await get(id, token);
    expectProblem(r, 404, 'not-found');
    assert.equal(r.body.title, missing.body.title);
    assert.deepEqual(Object.keys(r.body).sort(), Object.keys(missing.body).sort());
  }
  expectProblem(await get('abc', TOKENS.alice), 404, 'not-found');
});

// §4 — the response

test('§4 before judging: status queued and result null', async () => {
  const id = await submitAs(TOKENS.alice);
  const r = await get(id, TOKENS.alice);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'queued');
  assert.equal(r.body.result, null);
  assert.equal(r.body.labId, LAB.open);
  assert.equal(r.body.studentId, 1001);
  assert.equal(r.body.language, 'cpp');
  assert.equal(r.body.code, 'int main() { return 0; }\n');
  assert.equal(typeof r.body.submittedAt, 'string');
});

test('§4 after judging: the overall and per-test verdicts, never the tests’ input or output (FAQ-02)', async () => {
  const id = await submitAs(TOKENS.alice);
  judged(id, 'wrong_answer', [
    { idx: 0, verdict: 'AC', timeMs: 4 },
    { idx: 1, verdict: 'WA', timeMs: 3 },
  ]);
  const r = await get(id, TOKENS.alice);
  assert.equal(r.body.status, 'wrong_answer');
  assert.deepEqual(r.body.result, {
    status: 'wrong_answer',
    tests: [
      { idx: 0, verdict: 'AC', timeMs: 4 },
      { idx: 1, verdict: 'WA', timeMs: 3 },
    ],
  });
  assert.ok(!r.text.includes(SECRET_INPUT), 'a test input reached the student');
  assert.ok(!r.text.includes(SECRET_OUTPUT), 'an expected output reached the student');
});

test('§4 a compile error carries the compiler message', async () => {
  const id = await submitAs(TOKENS.alice);
  judged(id, 'compile_error', [], "main.cpp:1:1: error: 'x' was not declared");
  const r = await get(id, TOKENS.alice);
  assert.equal(r.body.result.status, 'compile_error');
  assert.equal(r.body.result.compileError, "main.cpp:1:1: error: 'x' was not declared");
});

test('§4 output over the limit is reported as runtime_error and RE (FAQ-05)', async () => {
  const id = await submitAs(TOKENS.alice);
  judged(id, 'output_limit', [{ idx: 0, verdict: 'OLE', timeMs: 40 }]);
  const r = await get(id, TOKENS.alice);
  assert.equal(r.body.status, 'runtime_error');
  assert.equal(r.body.result.status, 'runtime_error');
  assert.equal(r.body.result.tests[0].verdict, 'RE');
  assert.ok(!r.text.includes('output_limit') && !r.text.includes('OLE'));
});

test('§4 a student never sees the constraint review, even when it exists (FAQ-08)', async () => {
  const id = await submitAs(TOKENS.alice);
  judged(id, 'accepted', [{ idx: 0, verdict: 'AC', timeMs: 2 }]);
  reviewed(id);
  const r = await get(id, TOKENS.alice);
  assert.equal(r.status, 200);
  assert.equal('review' in r.body, false);
  assert.ok(!r.text.includes('violation'), 'a constraint verdict reached the student');
  assert.ok(!r.text.includes('std::sort(a, a + n)'), 'evidence reached the student');
});

test('§4 a TA of the class sees the review, with the deduction the TA set', async () => {
  const id = await submitAs(TOKENS.alice);
  judged(id, 'accepted', [{ idx: 0, verdict: 'AC', timeMs: 2 }]);
  reviewed(id);
  const r = await get(id, TOKENS.tara);
  assert.equal(r.body.review.state, 'done');
  assert.deepEqual(r.body.review.verdicts, [
    {
      constraint: 'C1',
      text: 'Do not call `std::sort`.',
      deduction: 3,
      verdict: 'violation',
      source: 'hard-rule',
      evidence: [{ line: 1, text: EVIDENCE }],
      unsureReason: null,
      reason: null,
    },
  ]);
});

test('§4 review state: pending while not reviewed, not-reviewed when not Accepted', async () => {
  const waiting = await submitAs(TOKENS.alice);
  assert.equal((await get(waiting, TOKENS.tara)).body.review.state, 'pending');
  const wrong = await submitAs(TOKENS.alice);
  judged(wrong, 'wrong_answer', [{ idx: 0, verdict: 'WA', timeMs: 2 }]);
  const r = await get(wrong, TOKENS.tara);
  assert.equal(r.body.review.state, 'not-reviewed');
  assert.deepEqual(r.body.review.verdicts, []);
});
