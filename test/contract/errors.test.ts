import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.ts';

let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => (srv = await startServer()));
after(() => srv.close());

test('§2 an unknown path is a 404 problem details object', async () => {
  const res = await fetch(`${srv.base}/no/such/path`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') ?? '', /^application\/problem\+json/);
  const body = await res.json();
  assert.equal(body.type, 'https://leetkob.example/problems/not-found');
  assert.equal(body.status, 404);
  assert.equal(typeof body.title, 'string');
  assert.equal(typeof body.detail, 'string');
});
