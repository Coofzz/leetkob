// The screens are static files in public/, served by the API. Student code, statements and constraint
// texts are hostile data, so the pages must never parse a string as HTML; every check is on the server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { startServer } from '../helpers/server.ts';

let srv: Awaited<ReturnType<typeof startServer>>;
before(async () => {
  srv = await startServer();
});
after(() => srv.close());

test('the sign-in page is served at / with a Content-Security-Policy that allows only our own scripts', async () => {
  const res = await fetch(`${srv.base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(await res.text(), /<form/);
});

test('every page is served, and the script it loads exists', async () => {
  for (const page of ['index.html', 'student.html', 'ta.html']) {
    const res = await fetch(`${srv.base}/${page}`);
    assert.equal(res.status, 200, page);
    for (const m of (await res.text()).matchAll(/<script src="([^"]+)"/g)) {
      assert.equal((await fetch(`${srv.base}/${m[1]}`)).status, 200, `${page} loads ${m[1]}`);
    }
  }
});

test('no page script turns a string into HTML', () => {
  for (const file of readdirSync('public').filter((f) => f.endsWith('.js'))) {
    const js = readFileSync(`public/${file}`, 'utf8');
    for (const sink of [
      'innerHTML',
      'outerHTML',
      'insertAdjacentHTML',
      'document.write',
      'eval(',
      'new Function',
    ]) {
      assert.ok(!js.includes(sink), `public/${file} uses ${sink}`);
    }
  }
});

test('no page has inline script or inline event handlers (the CSP would block them anyway)', () => {
  for (const file of readdirSync('public').filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(`public/${file}`, 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), `public/${file} has an inline <script>`);
    assert.ok(!/\son[a-z]+=/.test(html), `public/${file} has an inline event handler`);
  }
});

test('the student’s submit page tells them how their code is reviewed (FAQ-06)', () => {
  const html = readFileSync('public/student.html', 'utf8').replace(/\s+/g, ' '); // as a browser reads it
  assert.match(html, /hard rules/i);
  assert.match(html, /model/i);
  assert.match(html, /comments/i);
  assert.match(html, /TA/);
});
