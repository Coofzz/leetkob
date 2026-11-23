// Contract tests for docs/contract/post-class-labs.md.
// Written from the contract, not from the code: each test name starts with the section it checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS } from '../helpers/seed.ts';
import { seedAccounts, TIM_TOKEN } from '../helpers/accounts.ts';

const PROBLEM = 'https://leetkob.example/problems/';
let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
  seed(srv.db);
  seedAccounts(srv.db);
});
after(() => srv.close());

const inAWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
const goodLab = () => ({
  title: 'Count evens',
  statement: 'Read n integers and print how many are even.',
  deadlineAt: inAWeek(),
  tests: [
    { input: '3\n1 2 4\n', output: '2\n' },
    { input: '1\n7\n', output: '0\n' },
  ],
  constraints: [
    { id: 'C1', text: 'Do not call `std::count_if`.', deduction: 2 },
    { id: 'C2', text: 'Count with a loop you wrote yourself.', deduction: 3 },
  ],
});

async function create(
  classId: number | string,
  token: string | null,
  body: unknown = goodLab(),
  raw?: string,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${srv.base}/classes/${classId}/labs`, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(body),
  });
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null };
}

function expectProblem(r: Awaited<ReturnType<typeof create>>, status: number, type: string) {
  assert.equal(r.status, status, `expected ${status} ${type}, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  assert.equal(r.body.type, PROBLEM + type);
  assert.equal(r.body.status, status);
}

const labCount = () => Number((srv.db.prepare('SELECT COUNT(*) AS n FROM labs').get() as { n: number }).n);

// §3 — who may call it

test('§1 no Authorization header is 401 unauthenticated with WWW-Authenticate: Bearer', async () => {
  const r = await create(1, null);
  expectProblem(r, 401, 'unauthenticated');
  assert.equal(r.res.headers.get('www-authenticate'), 'Bearer');
});

test('§3 a student (even of this class), a TA of another class, a missing class: the same 404, nothing created', async () => {
  const before = labCount();
  const missing = await create(999, TOKENS.tara);
  expectProblem(missing, 404, 'not-found');
  const refused = [
    await create(1, TOKENS.alice), // student of class 1
    await create(1, TIM_TOKEN), // TA of class 2 only
    await create(2, TOKENS.tara), // TA of class 1 only
    await create('abc', TOKENS.tara),
  ];
  for (const r of refused) {
    expectProblem(r, 404, 'not-found');
    assert.equal(r.body.title, missing.body.title);
    assert.deepEqual(Object.keys(r.body).sort(), Object.keys(missing.body).sort());
  }
  assert.equal(labCount(), before, 'a refused request created a lab');
});

test('§3 who may call it is checked before the body: another class with a broken body is still 404', async () => {
  expectProblem(await create(1, TIM_TOKEN, null, '{"title": '), 404, 'not-found');
  expectProblem(await create(1, TIM_TOKEN, null, 'x'.repeat(9 * 1024 * 1024)), 404, 'not-found');
});

test('§3 an admin may create a lab in any class', async () => {
  const r = await create(2, TOKENS.root);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.classId, 2);
});

// §4 — request rules

test('§2 malformed JSON is 400 invalid-json', async () => {
  expectProblem(await create(1, TOKENS.tara, null, '{"title": "x",'), 400, 'invalid-json');
});

test('§4 validation lists every broken field, and creates nothing', async () => {
  const before = labCount();
  const r = await create(1, TOKENS.tara, {
    title: '',
    statement: 42,
    deadlineAt: '2000-01-01T00:00:00.000Z',
    limits: { cpuMs: 6000, memoryMb: 32 },
    tests: [],
    constraints: [
      { id: 'C1', text: 'Do not use `goto`.', deduction: 11 },
      { id: 'C1', text: '', deduction: 1.5 },
    ],
  });
  expectProblem(r, 400, 'validation');
  const pointers = r.body.errors.map((e: { pointer: string }) => e.pointer).sort();
  for (const p of [
    '/title',
    '/statement',
    '/deadlineAt',
    '/limits/cpuMs',
    '/limits/memoryMb',
    '/tests',
    '/constraints/0/deduction',
    '/constraints/1/id',
    '/constraints/1/text',
    '/constraints/1/deduction',
  ]) {
    assert.ok(pointers.includes(p), `missing ${p} in ${pointers.join(', ')}`);
  }
  assert.equal(labCount(), before);
});

test('§4 a deadline must be UTC with Z; a test must have string input and output', async () => {
  const r = await create(1, TOKENS.tara, {
    ...goodLab(),
    deadlineAt: '2999-01-01 10:00',
    tests: [{ input: '1\n', output: 1 }],
  });
  expectProblem(r, 400, 'validation');
  const pointers = r.body.errors.map((e: { pointer: string }) => e.pointer);
  assert.ok(pointers.includes('/deadlineAt'));
  assert.ok(pointers.includes('/tests/0/output'));
});

test('§2 a body larger than 8 MiB is 413 body-too-large', async () => {
  const big = { ...goodLab(), statement: 'x'.repeat(9 * 1024 * 1024) };
  expectProblem(await create(1, TOKENS.tara, big), 413, 'body-too-large');
});

// §5 — success

test('§5 success is 201 with Location and the documented body; tests and constraints are stored', async () => {
  const lab = goodLab();
  const r = await create(1, TOKENS.tara, lab);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.res.headers.get('location'), `/labs/${r.body.id}`);
  assert.equal(r.body.classId, 1);
  assert.equal(r.body.title, lab.title);
  assert.equal(r.body.deadlineAt, lab.deadlineAt);
  assert.deepEqual(r.body.limits, { cpuMs: 1000, memoryMb: 256 }, 'FAQ-05 defaults');
  assert.equal(r.body.testCount, 2);
  assert.deepEqual(r.body.constraints, lab.constraints);
  assert.equal(typeof r.body.createdAt, 'string');
  assert.equal('tests' in r.body, false, 'the response does not repeat the tests');

  const tests = srv.db
    .prepare('SELECT idx, input, expected_output FROM lab_tests WHERE lab_id = ? ORDER BY idx')
    .all(r.body.id);
  assert.deepEqual(
    tests.map((t) => [t.idx, t.input, t.expected_output]),
    [
      [0, '3\n1 2 4\n', '2\n'],
      [1, '1\n7\n', '0\n'],
    ],
  );
  const stored = srv.db
    .prepare('SELECT constraint_id, deduction FROM lab_constraints WHERE lab_id = ? ORDER BY constraint_id')
    .all(r.body.id);
  assert.deepEqual(
    stored.map((c) => [c.constraint_id, c.deduction]),
    [
      ['C1', 2],
      ['C2', 3],
    ],
  );
});

test('§5 limits within the range are kept, and a student of the class can submit to the new lab at once', async () => {
  const r = await create(1, TOKENS.tara, { ...goodLab(), limits: { cpuMs: 2000, memoryMb: 128 } });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.limits, { cpuMs: 2000, memoryMb: 128 });
  const submit = await fetch(`${srv.base}/labs/${r.body.id}/submissions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKENS.alice}`,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ language: 'cpp', code: 'int main() {}' }),
  });
  assert.equal(submit.status, 201);
});
