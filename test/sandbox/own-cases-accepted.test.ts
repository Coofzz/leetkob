// Every own-case solution must really be Accepted (leetkob-eval/README.md, "Adding your own cases"):
// compiled with g++ -std=c++17 -O2 and matching every .out token by token. Checked with our own judge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { judge } from '../../src/sandbox/runner.ts';

const DIR = 'own-cases';

for (const problem of readdirSync(join(DIR, 'problems'))) {
  const testsDir = join(DIR, 'problems', problem, 'tests');
  const tests = readdirSync(testsDir)
    .filter((f) => f.endsWith('.in'))
    .sort()
    .map((f) => ({
      input: readFileSync(join(testsDir, f), 'utf8'),
      expected: readFileSync(join(testsDir, f.replace(/\.in$/, '.out')), 'utf8'),
    }));
  for (const file of readdirSync(join(DIR, 'solutions', problem)).filter((f) => f.endsWith('.cpp'))) {
    test(`own case ${problem}/${file} is Accepted`, async () => {
      const source = readFileSync(join(DIR, 'solutions', problem, file), 'utf8');
      const r = await judge({
        jobId: `own-${file.replace(/\W/g, '')}`,
        source,
        tests,
        cpuMs: 1000,
        memoryMb: 256,
      });
      assert.equal(r.status, 'accepted', JSON.stringify(r));
    });
  }
}
