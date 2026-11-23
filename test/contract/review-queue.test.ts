// Contract tests for docs/contract/get-lab-review-queue.md.
// Written from the contract, not from the code: each test name starts with the section it checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS, LAB } from '../helpers/seed.ts';
import { seedAccounts, TIM_TOKEN } from '../helpers/accounts.ts';

const PROBLEM = 'https://leetkob.example/problems/';
const SAMPLED_LAB = 20; // 11 students, one pass each on C1 → ceil(1.1) = 2 in the sample
const ONE_PASS_LAB = 21; // one pass → at least one in the sample
const NO_PASS_LAB = 22; // no pass → none

let srv: Awaited<ReturnType<typeof startServer>>;
let nextSubmission = 5000;

function submission(labId: number, studentId: number, status = 'accepted'): number {
  const id = nextSubmission++;
  srv.db
    .prepare(
      `INSERT INTO submissions (id, lab_id, student_id, language, code, code_bytes, status, submitted_at)
       VALUES (?, ?, ?, 'cpp', 'int main() {}', 13, ?, ?)`,
    )
    .run(id, labId, studentId, status, new Date(Date.now() + id).toISOString());
  return id;
}
function verdict(
  submissionId: number,
  constraint: string,
  v: 'pass' | 'violation' | 'unsure',
  extra: {
    source?: string;
    unsureReason?: string;
    evidence?: { line: number; text: string }[];
    reason?: string;
  } = {},
) {
  srv.db
    .prepare(
      `INSERT INTO constraint_verdicts
         (submission_id, constraint_id, verdict, evidence_json, source, unsure_reason, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      submissionId,
      constraint,
      v,
      JSON.stringify(extra.evidence ?? []),
      extra.source ?? 'model',
      extra.unsureReason ?? null,
      extra.reason ?? null,
      new Date().toISOString(),
    );
}

let aliceOld = 0;
let aliceNow = 0;
let bobNow = 0;

before(async () => {
  srv = await startServer();
  seed(srv.db);
  seedAccounts(srv.db);
  srv.db.exec(`
    INSERT INTO lab_constraints (lab_id, constraint_id, position, text, deduction) VALUES
      (${LAB.open}, 'C1', 0, 'Do not call \`std::sort\`.', 3),
      (${LAB.open}, 'C2', 1, 'Sort with a merge sort you wrote yourself.', 4);
    INSERT INTO labs (id, class_id, title, deadline_at) VALUES
      (${SAMPLED_LAB}, 1, 'Sampled', '2999-01-01T00:00:00.000Z'),
      (${ONE_PASS_LAB}, 1, 'One pass', '2999-01-01T00:00:00.000Z'),
      (${NO_PASS_LAB}, 1, 'No pass', '2999-01-01T00:00:00.000Z');
    INSERT INTO lab_constraints (lab_id, constraint_id, position, text, deduction) VALUES
      (${SAMPLED_LAB}, 'C1', 0, 'Do not use \`goto\`.', 1),
      (${ONE_PASS_LAB}, 'C1', 0, 'Do not use \`goto\`.', 1),
      (${NO_PASS_LAB}, 'C1', 0, 'Do not use \`goto\`.', 1);
  `);
  for (let i = 0; i < 11; i++) {
    srv.db
      .prepare(`INSERT INTO users (id, name, role, token) VALUES (?, ?, 'student', ?)`)
      .run(1100 + i, `S${i}`, `tok-s${i}`);
    srv.db.prepare('INSERT INTO class_members (class_id, user_id) VALUES (1, ?)').run(1100 + i);
  }

  // Lab 1: Alice's older submission had a violation; her latest is what counts.
  aliceOld = submission(LAB.open, 1001);
  verdict(aliceOld, 'C1', 'violation', { source: 'hard-rule', evidence: [{ line: 1, text: 'old' }] });
  verdict(aliceOld, 'C2', 'pass');
  aliceNow = submission(LAB.open, 1001);
  verdict(aliceNow, 'C1', 'pass', { source: 'hard-rule' });
  verdict(aliceNow, 'C2', 'unsure', { unsureReason: 'timeout' });
  bobNow = submission(LAB.open, 1002);
  verdict(bobNow, 'C1', 'violation', {
    source: 'hard-rule',
    evidence: [{ line: 4, text: '  std::sort(a, a + n);' }],
  });
  verdict(bobNow, 'C2', 'violation', {
    evidence: [{ line: 7, text: '  bubble(a, n);' }],
    reason: 'bubble sort',
  });

  for (let i = 0; i < 11; i++)
    verdict(submission(SAMPLED_LAB, 1100 + i), 'C1', 'pass', { source: 'hard-rule' });
  verdict(submission(ONE_PASS_LAB, 1100), 'C1', 'pass', { source: 'hard-rule' });
  verdict(submission(NO_PASS_LAB, 1100), 'C1', 'violation', {
    source: 'hard-rule',
    evidence: [{ line: 2, text: 'goto x;' }],
  });
  submission(NO_PASS_LAB, 1101, 'judging'); // counted, not reviewed yet
});
after(() => srv.close());

async function queue(labId: number | string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${srv.base}/labs/${labId}/review-queue`, { headers });
  const text = await res.text();
  return { res, status: res.status, text, body: text ? JSON.parse(text) : null };
}
function expectProblem(r: Awaited<ReturnType<typeof queue>>, status: number, type: string) {
  assert.equal(r.status, status, `expected ${status} ${type}, got ${r.status} ${r.text}`);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  assert.equal(r.body.type, PROBLEM + type);
}

// §3 — who may see it

test('§1 no Authorization header is 401 unauthenticated with WWW-Authenticate: Bearer', async () => {
  const r = await queue(LAB.open, null);
  expectProblem(r, 401, 'unauthenticated');
  assert.equal(r.res.headers.get('www-authenticate'), 'Bearer');
});

test('§3 a TA of the class and an admin see the queue', async () => {
  assert.equal((await queue(LAB.open, TOKENS.tara)).status, 200);
  assert.equal((await queue(LAB.open, TOKENS.root)).status, 200);
});

test('§3 a student of the class gets 403 forbidden', async () => {
  expectProblem(await queue(LAB.open, TOKENS.alice), 403, 'forbidden');
});

test('§3 a TA or a student of another class gets the same 404 as a missing lab', async () => {
  const missing = await queue(999, TOKENS.tara);
  expectProblem(missing, 404, 'not-found');
  for (const r of [await queue(LAB.open, TIM_TOKEN), await queue(LAB.open, TOKENS.carol)]) {
    expectProblem(r, 404, 'not-found');
    assert.equal(r.body.title, missing.body.title);
  }
  expectProblem(await queue('abc', TOKENS.tara), 404, 'not-found');
});

// §4 — what is in the queue

test('§4 every violation and every unsure of the counted submissions; earlier submissions never appear', async () => {
  const r = await queue(LAB.open, TOKENS.tara);
  assert.equal(r.body.labId, LAB.open);
  assert.equal(r.body.countedSubmissions, 2);
  const keys = r.body.items
    .filter((i: { inSample: boolean }) => !i.inSample)
    .map(
      (i: { submissionId: number; constraint: string; verdict: string }) =>
        `${i.submissionId}/${i.constraint}/${i.verdict}`,
    );
  assert.deepEqual(keys, [`${bobNow}/C1/violation`, `${bobNow}/C2/violation`, `${aliceNow}/C2/unsure`]);
  assert.ok(!r.body.items.some((i: { submissionId: number }) => i.submissionId === aliceOld));
});

test('§4 each item carries the TA’s deduction, the evidence, the source and the unsure reason', async () => {
  const r = await queue(LAB.open, TOKENS.tara);
  const bobC1 = r.body.items.find(
    (i: { submissionId: number; constraint: string }) => i.submissionId === bobNow && i.constraint === 'C1',
  );
  assert.deepEqual(bobC1, {
    submissionId: bobNow,
    studentId: 1002,
    studentName: 'Bob',
    constraint: 'C1',
    text: 'Do not call `std::sort`.',
    deduction: 3,
    verdict: 'violation',
    source: 'hard-rule',
    evidence: [{ line: 4, text: '  std::sort(a, a + n);' }],
    unsureReason: null,
    reason: null,
    inSample: false,
  });
  const aliceC2 = r.body.items.find(
    (i: { submissionId: number; constraint: string }) => i.submissionId === aliceNow && i.constraint === 'C2',
  );
  assert.equal(aliceC2.unsureReason, 'timeout');
  assert.equal(aliceC2.deduction, 4);
});

test('§4 the pass sample is ceil(10%) of the pass verdicts, at least one when there is a pass (FAQ-10)', async () => {
  const sampled = await queue(SAMPLED_LAB, TOKENS.tara);
  assert.equal(sampled.body.passVerdicts, 11);
  assert.equal(sampled.body.sampledPass, 2);
  const passes = sampled.body.items.filter((i: { verdict: string }) => i.verdict === 'pass');
  assert.equal(passes.length, 2);
  assert.ok(passes.every((i: { inSample: boolean }) => i.inSample));

  const one = await queue(ONE_PASS_LAB, TOKENS.tara);
  assert.equal(one.body.sampledPass, 1);
  assert.equal(one.body.items.length, 1);

  const none = await queue(NO_PASS_LAB, TOKENS.tara);
  assert.equal(none.body.passVerdicts, 0);
  assert.equal(none.body.sampledPass, 0);
  assert.equal(none.body.items.filter((i: { verdict: string }) => i.verdict === 'pass').length, 0);
});

test('§4 the sample does not change between requests', async () => {
  const pick = async () =>
    (await queue(SAMPLED_LAB, TOKENS.tara)).body.items
      .map((i: { submissionId: number }) => i.submissionId)
      .sort();
  assert.deepEqual(await pick(), await pick());
});

test('§4 counted submissions not reviewed yet are counted as pending', async () => {
  const r = await queue(NO_PASS_LAB, TOKENS.tara);
  assert.equal(r.body.countedSubmissions, 2);
  assert.equal(r.body.pendingSubmissions, 1);
});

test('§4 nothing publishes a mark in PA#3: there is no publish endpoint', async () => {
  const res = await fetch(`${srv.base}/labs/${LAB.open}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKENS.tara}` },
  });
  assert.equal(res.status, 404);
});
