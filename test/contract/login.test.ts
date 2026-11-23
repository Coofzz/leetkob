// Contract tests for docs/contract/post-auth-login.md.
// Written from the contract, not from the code: each test name starts with the section it checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS, LAB } from '../helpers/seed.ts';
import { seedAccounts, PASSWORDS } from '../helpers/accounts.ts';

const PROBLEM = 'https://leetkob.example/problems/';
let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
  seed(srv.db);
  seedAccounts(srv.db);
});
after(() => srv.close());

async function login(body: unknown, raw?: string) {
  const res = await fetch(`${srv.base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null };
}

function expectProblem(r: Awaited<ReturnType<typeof login>>, status: number, type: string) {
  assert.equal(r.status, status, `expected ${status} ${type}, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  assert.equal(r.body.type, PROBLEM + type);
  assert.equal(r.body.status, status);
}

test('§4 the right password gives 200 with a token, the user, and Cache-Control: no-store', async () => {
  const r = await login({ username: 'tara', password: PASSWORDS.tara });
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(typeof r.body.token, 'string');
  assert.ok(r.body.token.length >= 32);
  assert.deepEqual(r.body.user, { id: 2001, name: 'Tara', role: 'ta' });
});

test('§3 a wrong password and an unknown username get the same 401 response', async () => {
  const wrong = await login({ username: 'tara', password: 'not-her-password' });
  const unknown = await login({ username: 'nobody-here', password: 'whatever' });
  expectProblem(wrong, 401, 'unauthenticated');
  expectProblem(unknown, 401, 'unauthenticated');
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal('token' in wrong.body, false);
});

test('§3 the password is checked exactly: other case or extra spaces are wrong', async () => {
  expectProblem(
    await login({ username: 'tara', password: PASSWORDS.tara.toUpperCase() }),
    401,
    'unauthenticated',
  );
  expectProblem(await login({ username: 'tara', password: ` ${PASSWORDS.tara}` }), 401, 'unauthenticated');
});

test('§4 the token works as Bearer, and signing in again makes the earlier token stop working', async () => {
  const first = await login({ username: 'alice', password: PASSWORDS.alice });
  const submit = (token: string) =>
    fetch(`${srv.base}/labs/${LAB.open}/submissions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ language: 'cpp', code: 'int main() {}' }),
    });
  assert.equal((await submit(first.body.token)).status, 201);
  assert.equal((await submit(TOKENS.alice)).status, 401, 'the seeded token should no longer work');

  const second = await login({ username: 'alice', password: PASSWORDS.alice });
  assert.notEqual(second.body.token, first.body.token);
  assert.equal((await submit(first.body.token)).status, 401);
  assert.equal((await submit(second.body.token)).status, 201);
});

test('§2 malformed JSON is 400 invalid-json', async () => {
  expectProblem(await login(null, '{"username": "tara",'), 400, 'invalid-json');
});

test('§3 validation lists every broken field', async () => {
  const r = await login({ username: '', password: 42 });
  expectProblem(r, 400, 'validation');
  assert.deepEqual(r.body.errors.map((e: { pointer: string }) => e.pointer).sort(), [
    '/password',
    '/username',
  ]);
  const notObject = await login(['tara']);
  expectProblem(notObject, 400, 'validation');
  assert.equal(notObject.body.errors[0].pointer, '');
});

test('§2 a body larger than 16 KiB is 413 body-too-large', async () => {
  expectProblem(await login({ username: 'tara', password: 'x'.repeat(17 * 1024) }), 413, 'body-too-large');
});
