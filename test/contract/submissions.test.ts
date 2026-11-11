// Contract tests for docs/contract/post-lab-submissions.md.
// Written from the contract, not from the code: each test name starts with the section it checks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { startServer } from '../helpers/server.ts';
import { seed, TOKENS, LAB } from '../helpers/seed.ts';

const PROBLEM = 'https://leetkob.example/problems/';
let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
  seed(srv.db);
});
after(() => srv.close());

const okBody = { language: 'cpp', code: '#include <cstdio>\nint main() { return 0; }\n' };

interface Call {
  lab?: number | string;
  token?: string | null;
  key?: string | null;
  body?: unknown;
  raw?: string;
}
async function submit({
  lab = LAB.open,
  token = TOKENS.alice,
  key = randomUUID(),
  body = okBody,
  raw,
}: Call = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (key !== null) headers['idempotency-key'] = key;
  const res = await fetch(`${srv.base}/labs/${lab}/submissions`, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(body),
  });
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null };
}

async function expectProblem(r: Awaited<ReturnType<typeof submit>>, status: number, type: string) {
  assert.equal(r.status, status, `expected ${status} ${type}, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  assert.equal(r.body.type, PROBLEM + type);
  assert.equal(r.body.status, status);
  assert.equal(typeof r.body.title, 'string');
  assert.equal(typeof r.body.detail, 'string');
}

// §3 — authentication, role and ownership
test('§1 no Authorization header is 401 unauthenticated with WWW-Authenticate: Bearer', async () => {
  const r = await submit({ token: null });
  await expectProblem(r, 401, 'unauthenticated');
  assert.equal(r.res.headers.get('www-authenticate'), 'Bearer');
});

test('§1 an unknown token is 401 unauthenticated', async () => {
  await expectProblem(await submit({ token: 'not-a-token' }), 401, 'unauthenticated');
});

test('§3 a student of another class gets 404, the same as a lab that does not exist', async () => {
  const notMine = await submit({ token: TOKENS.carol, lab: LAB.open });
  const missing = await submit({ token: TOKENS.carol, lab: LAB.missing });
  await expectProblem(notMine, 404, 'not-found');
  await expectProblem(missing, 404, 'not-found');
  assert.equal(notMine.body.title, missing.body.title);
  assert.deepEqual(Object.keys(notMine.body).sort(), Object.keys(missing.body).sort());
});

test('§3 a TA of the lab’s class may not submit: 404', async () => {
  await expectProblem(await submit({ token: TOKENS.tara }), 404, 'not-found');
});

test('§3 an admin may not submit: 404', async () => {
  await expectProblem(await submit({ token: TOKENS.root }), 404, 'not-found');
});

test('§2 a labId that is not a positive integer is 404 not-found', async () => {
  await expectProblem(await submit({ lab: 'abc' }), 404, 'not-found');
  await expectProblem(await submit({ lab: 0 }), 404, 'not-found');
});

test('§4 ownership is checked before the body: another class with a broken body is still 404', async () => {
  await expectProblem(await submit({ token: TOKENS.carol, lab: LAB.open, raw: '{oops' }), 404, 'not-found');
});

// §4 — request rules, in the documented order
test('§5 no Idempotency-Key is 400 idempotency-key-missing', async () => {
  await expectProblem(await submit({ key: null }), 400, 'idempotency-key-missing');
});

test('§5 a key longer than 255 characters is 400 idempotency-key-missing', async () => {
  await expectProblem(await submit({ key: 'k'.repeat(256) }), 400, 'idempotency-key-missing');
});

test('§4 malformed JSON is 400 invalid-json', async () => {
  await expectProblem(await submit({ raw: '{"language": "cpp", ' }), 400, 'invalid-json');
});

test('§4 validation lists every broken field, not just the first', async () => {
  const r = await submit({ body: { language: 'python', code: '' } });
  await expectProblem(r, 400, 'validation');
  const pointers = r.body.errors.map((e: { pointer: string }) => e.pointer).sort();
  assert.deepEqual(pointers, ['/code', '/language']);
});

test('§4 a body that is not a JSON object is validation with pointer ""', async () => {
  const r = await submit({ body: ['cpp'] });
  await expectProblem(r, 400, 'validation');
  assert.equal(r.body.errors[0].pointer, '');
});

test('§4 code longer than 65 536 bytes is 413 code-too-large', async () => {
  await expectProblem(
    await submit({ body: { language: 'cpp', code: 'x'.repeat(65_537) } }),
    413,
    'code-too-large',
  );
});

test('§4 code of exactly 65 536 bytes in UTF-8 is accepted', async () => {
  const r = await submit({ body: { language: 'cpp', code: 'x'.repeat(65_536) } });
  assert.equal(r.status, 201);
  assert.equal(r.body.codeBytes, 65_536);
});

test('§4 after the deadline it is 422 deadline-passed', async () => {
  await expectProblem(await submit({ lab: LAB.closed }), 422, 'deadline-passed');
});

test('§4 success is 201 with Location and the documented body', async () => {
  const r = await submit();
  assert.equal(r.status, 201);
  assert.match(r.res.headers.get('content-type') ?? '', /^application\/json/);
  assert.equal(r.res.headers.get('location'), `/submissions/${r.body.id}`);
  assert.ok(Number.isInteger(r.body.id) && r.body.id > 0);
  assert.equal(r.body.labId, LAB.open);
  assert.equal(r.body.studentId, 1001);
  assert.equal(r.body.language, 'cpp');
  assert.equal(r.body.status, 'queued');
  assert.equal(r.body.codeBytes, Buffer.byteLength(okBody.code, 'utf8'));
  assert.match(r.body.submittedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

// §5 — idempotency
test('§5 the same key and body replays the stored response, and creates nothing new', async () => {
  const key = randomUUID();
  const first = await submit({ key });
  const again = await submit({ key });
  assert.equal(first.status, 201);
  assert.equal(again.status, 201);
  assert.deepEqual(again.body, first.body);
  assert.equal(again.res.headers.get('location'), first.res.headers.get('location'));
  assert.equal(again.res.headers.get('idempotent-replayed'), 'true');
  assert.equal(first.res.headers.get('idempotent-replayed'), null);
});

test('§5 "the same body" is the same JSON value: key order and whitespace do not matter', async () => {
  const key = randomUUID();
  const first = await submit({ key, raw: JSON.stringify({ language: 'cpp', code: 'int main(){}' }) });
  const again = await submit({ key, raw: '{ "code" : "int main(){}",\n "language":"cpp" }' });
  assert.equal(again.status, 201);
  assert.equal(again.body.id, first.body.id);
});

test('§5 the same key with a different body is 422 idempotency-key-reused', async () => {
  const key = randomUUID();
  await submit({ key });
  const r = await submit({ key, body: { language: 'cpp', code: 'int main(){ return 1; }' } });
  await expectProblem(r, 422, 'idempotency-key-reused');
});

test('§5 an extra field the server ignores still makes the body different', async () => {
  const key = randomUUID();
  await submit({ key });
  await expectProblem(await submit({ key, body: { ...okBody, note: 'x' } }), 422, 'idempotency-key-reused');
});

test('§5 a key belongs to one student: another student with the same key gets a new submission', async () => {
  const key = randomUUID();
  const a = await submit({ key, token: TOKENS.alice });
  const b = await submit({ key, token: TOKENS.bob });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(b.body.id, a.body.id);
  assert.equal(b.body.studentId, 1002);
  assert.equal(b.res.headers.get('idempotent-replayed'), null);
});

test('§5 only a 201 is stored: after a validation error the same key can be used with a fixed body', async () => {
  const key = randomUUID();
  await expectProblem(await submit({ key, body: { language: 'cpp', code: '' } }), 400, 'validation');
  const fixed = await submit({ key });
  assert.equal(fixed.status, 201);
  assert.equal(fixed.res.headers.get('idempotent-replayed'), null);
});

test('§5 the same key while the first request is still being processed is 409 in-flight', async () => {
  const key = randomUUID();
  const body = JSON.stringify(okBody);
  const url = new URL(`${srv.base}/labs/${LAB.open}/submissions`);
  // The first request sends its headers and half of its body, then waits.
  const firstDone = new Promise<number>((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKENS.alice}`,
          'idempotency-key': key,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.write(body.slice(0, 10));
    setTimeout(() => req.end(body.slice(10)), 300);
  });
  await new Promise((r) => setTimeout(r, 100));
  await expectProblem(await submit({ key }), 409, 'idempotency-key-in-flight');
  assert.equal(await firstDone, 201);
  const replay = await submit({ key });
  assert.equal(replay.res.headers.get('idempotent-replayed'), 'true');
});
