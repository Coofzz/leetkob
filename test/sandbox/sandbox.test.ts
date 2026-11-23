// The nine sandbox minimums (class brief §5, session 6 slides §14–16), one attack each, plus controls.
// Each attack prints a marker when it SUCCEEDS; each test asserts the marker never comes out, so the
// test fails if the sandbox loses that protection. Needs Docker and the image: npm run sandbox:build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { judge } from '../../src/sandbox/runner.ts';
import type { JudgeInput, JudgeResult } from '../../src/types.ts';

const source = (file: string) => readFileSync(new URL(`./attacks/${file}`, import.meta.url), 'utf8');

/** Runs one file through the real sandbox; returns the result, the job id and the elapsed time. */
async function run(file: string, tests: JudgeInput['tests'], cpuMs = 1000) {
  const jobId = `t${randomUUID().slice(0, 8)}`;
  const started = Date.now();
  const result: JudgeResult = await judge({ jobId, source: source(file), tests, cpuMs, memoryMb: 256 });
  return { result, jobId, ms: Date.now() - started };
}

/** Containers of a job still present (running or stopped). Must be none once judge() returns. */
const leftovers = (jobId: string) =>
  execFileSync('docker', ['ps', '-a', '-q', '--filter', `name=job-${jobId}`], { encoding: 'utf8' }).trim();

const one = (expected: string, input = '') => [{ input, expected }];

test('control: a correct solution is accepted, a wrong one is wrong_answer', async () => {
  const ok = await run('ok-sum.cpp', [
    { input: '1 2\n', expected: '3\n' },
    { input: '-5 5', expected: '0' },
  ]);
  assert.equal(ok.result.status, 'accepted');
  assert.deepEqual(
    ok.result.tests.map((t) => t.verdict),
    ['AC', 'AC'],
  );
  const wrong = await run('ok-sum.cpp', one('4', '1 2'));
  assert.equal(wrong.result.status, 'wrong_answer');
  assert.equal(leftovers(ok.jobId) + leftovers(wrong.jobId), '');
});

test('control: code that does not compile is compile_error with the compiler message', async () => {
  const { result, jobId } = await run('ok-compile-error.cpp', one(''));
  assert.equal(result.status, 'compile_error');
  assert.match(result.compileStderr ?? '', /undefined_name/);
  assert.deepEqual(result.tests, []);
  assert.equal(leftovers(jobId), '');
});

test('attack 1 network: a TCP connection to 1.1.1.1:80 never succeeds', async () => {
  const { result, jobId } = await run('01-network.cpp', one('BLOCKED'));
  assert.equal(result.status, 'accepted', 'the program printed CONNECTED: the sandbox has a network');
  assert.equal(leftovers(jobId), '');
});

test('attack 2 CPU: an endless loop is stopped at the CPU limit as time_limit', async () => {
  const { result, jobId, ms } = await run('02-cpu.cpp', one(''), 1000);
  assert.equal(result.status, 'time_limit');
  assert.equal(result.tests[0]?.verdict, 'TLE');
  assert.ok(ms < 15_000, `took ${ms} ms`);
  assert.equal(leftovers(jobId), '');
});

test('attack 3 wall clock: a sleeping program and its child are killed with the whole container', async () => {
  const { result, jobId, ms } = await run('03-wall.cpp', one(''), 1000);
  assert.equal(result.status, 'time_limit');
  assert.ok(ms < 20_000, `took ${ms} ms: the job's wall-clock budget did not stop it`);
  assert.ok(ms > 3_000, `took ${ms} ms: the program cannot have outlived the 3 s test wall limit`);
  assert.equal(leftovers(jobId), '', 'a container of the job is still there');
});

test('attack 4 memory: 1 GiB written and read back is killed as memory_limit', async () => {
  const { result, jobId } = await run('04-memory.cpp', one('33423360'));
  assert.equal(result.status, 'memory_limit', 'the program used 1 GiB: memory (or swap) is not limited');
  assert.equal(result.tests[0]?.verdict, 'MLE');
  assert.equal(leftovers(jobId), '');
});

test('attack 5 processes: fork() is refused long before 200 children', async () => {
  const { result, jobId, ms } = await run('05-processes.cpp', one('LIMITED'));
  assert.equal(result.status, 'accepted', 'the program printed UNLIMITED: there is no process limit');
  assert.ok(ms < 20_000, `took ${ms} ms`);
  assert.equal(leftovers(jobId), '');
});

test('attack 6 output: printing forever is cut at 1 MB and stopped as output_limit', async () => {
  const { result, jobId, ms } = await run('06-output.cpp', one(''));
  assert.equal(result.status, 'output_limit');
  assert.equal(result.tests[0]?.verdict, 'OLE');
  assert.ok(ms < 15_000, `took ${ms} ms`);
  assert.equal(leftovers(jobId), '');
});

test('attack 7 root: the program does not run as uid 0', async () => {
  const { result, jobId } = await run('07-root.cpp', one('NONROOT'));
  assert.equal(result.status, 'accepted', 'the program printed ROOT');
  assert.equal(leftovers(jobId), '');
});

test('attack 8 host: no Docker socket, and nothing outside /tmp can be written', async () => {
  const { result, jobId } = await run('08-host.cpp', one('SEALED'));
  assert.equal(result.status, 'accepted', 'the program found the Docker socket or wrote outside /tmp');
  assert.equal(leftovers(jobId), '');
});

test('attack 9 secrets: the API key in the worker environment never reaches the program', async () => {
  const canary = `canary-${randomUUID()}`;
  const saved = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = canary;
  try {
    const { result, jobId } = await run('09-secrets.cpp', one('CLEAN'));
    assert.equal(result.status, 'accepted', 'the program found LLM_API_KEY or the canary');
    assert.equal(leftovers(jobId), '');

    const inc = await run('09-include.cpp', one(''));
    assert.equal(inc.result.status, 'compile_error');
    assert.match(
      inc.result.compileStderr ?? '',
      /NO_SECRET_FILE/,
      'a secrets file is readable at compile time',
    );
    assert.ok(!(inc.result.compileStderr ?? '').includes(canary), 'the canary is in the compile errors');
    assert.ok(!(inc.result.compileStderr ?? '').includes('LLM_API_KEY'));
    assert.equal(leftovers(inc.jobId), '');
  } finally {
    if (saved === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = saved;
  }
});
