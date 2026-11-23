import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeJudge, fakeReview } from '../helpers/fakes.ts';
import type { JudgeInput } from '../../src/types.ts';

const input: JudgeInput = {
  jobId: 'job-1',
  source: 'int main() {}',
  tests: [
    { input: '1\n', expected: '1\n' },
    { input: '2\n', expected: '2\n' },
  ],
  cpuMs: 1000,
  memoryMb: 256,
};

test('fakeJudge accepts every test by default', async () => {
  assert.deepEqual(await fakeJudge()(input), {
    status: 'accepted',
    tests: [
      { idx: 0, verdict: 'AC', timeMs: 0 },
      { idx: 1, verdict: 'AC', timeMs: 0 },
    ],
  });
});

test('fakeJudge follows a script when given one', async () => {
  const judge = fakeJudge(() => ({ status: 'compile_error', compileStderr: 'error: x', tests: [] }));
  assert.equal((await judge(input)).status, 'compile_error');
});

test('fakeReview marks every constraint unsure with reason model-off and no evidence', async () => {
  const results = await fakeReview(
    {
      statement: 's',
      source: 'int main() {}',
      constraints: [
        { id: 'C1', text: 'Do not use `std::sort`.' },
        { id: 'C2', text: 'Implement merge sort yourself.' },
      ],
    },
    { modelOff: true },
  );
  assert.deepEqual(
    results.map((r) => [r.constraint, r.verdict, r.unsureReason, r.evidence.length]),
    [
      ['C1', 'unsure', 'model-off', 0],
      ['C2', 'unsure', 'model-off', 0],
    ],
  );
});
