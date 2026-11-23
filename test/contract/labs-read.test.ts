// Contract tests for docs/contract/get-labs.md.
// Written from the contract, not from the code: each test name starts with the section it checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS, LAB } from '../helpers/seed.ts';
import { seedAccounts, TIM_TOKEN } from '../helpers/accounts.ts';

const PROBLEM = 'https://leetkob.example/problems/';
const SECRET = 'hidden-test-data-4421';

let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
  seed(srv.db);
  seedAccounts(srv.db);
  srv.db.exec(`
    UPDATE labs SET statement = 'Sort the numbers.', cpu_ms = 2000, memory_mb = 128 WHERE id = ${LAB.open};
    INSERT INTO lab_tests (lab_id, idx, input, expected_output) VALUES
      (${LAB.open}, 0, '${SECRET}', '${SECRET}'), (${LAB.open}, 1, '1', '1');
    INSERT INTO lab_constraints (lab_id, constraint_id, position, text, deduction) VALUES
      (${LAB.open}, 'C2', 1, 'Sort with a merge sort you wrote yourself.', 4),
      (${LAB.open}, 'C1', 0, 'Do not call \`std::sort\`.', 3);
  `);
});
after(() => srv.close());

async function get(path: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${srv.base}${path}`, { headers });
  const text = await res.text();
  return { res, status: res.status, text, body: text ? JSON.parse(text) : null };
}
function expectProblem(r: Awaited<ReturnType<typeof get>>, status: number, type: string) {
  assert.equal(r.status, status, `expected ${status} ${type}, got ${r.status} ${r.text}`);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  assert.equal(r.body.type, PROBLEM + type);
}
async function submitAs(token: string): Promise<number> {
  const res = await fetch(`${srv.base}/labs/${LAB.open}/submissions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({ language: 'cpp', code: 'int main() {}' }),
  });
  assert.equal(res.status, 201);
  return ((await res.json()) as { id: number }).id;
}
const ids = (r: Awaited<ReturnType<typeof get>>) => r.body.labs.map((l: { id: number }) => l.id).sort();

test('§1 no Authorization header is 401 unauthenticated on both endpoints', async () => {
  expectProblem(await get('/labs', null), 401, 'unauthenticated');
  expectProblem(await get(`/labs/${LAB.open}`, null), 401, 'unauthenticated');
});

test('§3 each caller sees the labs of their own classes; an admin sees every lab', async () => {
  assert.deepEqual(ids(await get('/labs', TOKENS.alice)), [LAB.open, LAB.closed].sort());
  assert.deepEqual(ids(await get('/labs', TOKENS.tara)), [LAB.open, LAB.closed].sort());
  assert.deepEqual(ids(await get('/labs', TOKENS.carol)), [LAB.otherClass]);
  assert.deepEqual(ids(await get('/labs', TIM_TOKEN)), [LAB.otherClass]);
  assert.deepEqual(ids(await get('/labs', TOKENS.root)), [LAB.open, LAB.closed, LAB.otherClass].sort());
});

test('§3 a lab in the list has its class name, title and deadline', async () => {
  const r = await get('/labs', TOKENS.alice);
  const lab = r.body.labs.find((l: { id: number }) => l.id === LAB.open);
  assert.deepEqual(lab, {
    id: LAB.open,
    classId: 1,
    className: 'CS101 group 1',
    title: 'Sorting',
    deadlineAt: '2999-12-31T23:59:59.999Z',
  });
});

test('§4 a student of the class sees the statement, the limits and every constraint with its deduction (FAQ-06)', async () => {
  const r = await get(`/labs/${LAB.open}`, TOKENS.alice);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.statement, 'Sort the numbers.');
  assert.deepEqual(r.body.limits, { cpuMs: 2000, memoryMb: 128 });
  assert.equal(r.body.testCount, 2);
  assert.deepEqual(r.body.constraints, [
    { id: 'C1', text: 'Do not call `std::sort`.', deduction: 3 },
    { id: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: 4 },
  ]);
  assert.ok(!r.text.includes(SECRET), 'test data reached the student');
});

test('§4 a student sees only their own submissions, newest first; a TA gets no mySubmissions', async () => {
  const first = await submitAs(TOKENS.alice);
  const second = await submitAs(TOKENS.alice);
  await submitAs(TOKENS.bob);
  const alice = await get(`/labs/${LAB.open}`, TOKENS.alice);
  assert.deepEqual(
    alice.body.mySubmissions.map((s: { id: number }) => s.id),
    [second, first],
  );
  assert.equal(alice.body.mySubmissions[0].status, 'queued');
  assert.equal(typeof alice.body.mySubmissions[0].submittedAt, 'string');
  const tara = await get(`/labs/${LAB.open}`, TOKENS.tara);
  assert.equal(tara.status, 200);
  assert.equal('mySubmissions' in tara.body, false);
});

test('§4 output over the limit shows as runtime_error in mySubmissions (FAQ-05)', async () => {
  const id = await submitAs(TOKENS.alice);
  srv.db.prepare("UPDATE submissions SET status = 'output_limit' WHERE id = ?").run(id);
  const r = await get(`/labs/${LAB.open}`, TOKENS.alice);
  assert.equal(r.body.mySubmissions.find((s: { id: number }) => s.id === id).status, 'runtime_error');
});

test('§4 a student or a TA of another class gets the same 404 as a missing lab', async () => {
  const missing = await get('/labs/999', TOKENS.alice);
  expectProblem(missing, 404, 'not-found');
  for (const r of [await get(`/labs/${LAB.open}`, TOKENS.carol), await get(`/labs/${LAB.open}`, TIM_TOKEN)]) {
    expectProblem(r, 404, 'not-found');
    assert.equal(r.body.title, missing.body.title);
  }
  expectProblem(await get('/labs/abc', TOKENS.alice), 404, 'not-found');
  assert.equal((await get(`/labs/${LAB.open}`, TOKENS.root)).status, 200);
});
