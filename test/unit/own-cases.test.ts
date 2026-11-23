// Our own cases (rubric criterion 6): at least 5 labelled cases in the dev set's layout, with at least one
// trap and one injection, scored by the same eval.mjs. With the model off the checker must make no
// wrongful deduction on them either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/checker/cli.ts';

const DIR = 'own-cases';
interface Label {
  solution: string;
  constraint: string;
  label: 'pass' | 'violation';
  evidence: number[];
  tags: string[];
}
const labels = () =>
  readFileSync(join(DIR, 'labels.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Label);

test('own cases: the dev set layout, at least 5 solutions, a label for every (solution, constraint)', () => {
  const pairs = new Set<string>();
  let solutions = 0;
  for (const problem of readdirSync(join(DIR, 'problems'))) {
    const p = join(DIR, 'problems', problem);
    assert.ok(existsSync(join(p, 'statement.md')), `${problem}: statement.md`);
    const constraints = JSON.parse(readFileSync(join(p, 'constraints.json'), 'utf8')) as { id: string }[];
    assert.ok(
      readdirSync(join(p, 'tests')).some((f) => f.endsWith('.in')),
      `${problem}: tests`,
    );
    for (const file of readdirSync(join(DIR, 'solutions', problem)).filter((f) => f.endsWith('.cpp'))) {
      solutions++;
      for (const c of constraints) pairs.add(`${problem}/${file.replace(/\.cpp$/, '')} ${c.id}`);
    }
  }
  assert.ok(solutions >= 5, `only ${solutions} solutions`);
  const labelled = labels().map((l) => `${l.solution} ${l.constraint}`);
  assert.deepEqual([...labelled].sort(), [...pairs].sort());
});

test('own cases: at least one trap and one injection; every violation cites a line', () => {
  const all = labels();
  assert.ok(
    all.some((l) => l.tags.includes('trap')),
    'no trap',
  );
  assert.ok(
    all.some((l) => l.tags.includes('injection')),
    'no injection',
  );
  for (const l of all) {
    if (l.label === 'violation')
      assert.ok(l.evidence.length > 0, `${l.solution} ${l.constraint}: no evidence`);
    else assert.deepEqual(l.evidence, [], `${l.solution} ${l.constraint}: a pass has no evidence`);
  }
});

test('own cases: eval.mjs accepts them, and the checker with the model off makes no wrongful deduction', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'own-'));
  const out = join(dir, 'predictions.jsonl');
  assert.equal(await main(['--data', DIR, '--out', out], { MODEL_OFF: '1' }), 0);
  const summary = join(dir, 'summary.json');
  let status = 0;
  try {
    execFileSync(
      process.execPath,
      ['leetkob-eval/eval.mjs', '--data', DIR, '--predictions', out, '--json', summary],
      {
        stdio: 'ignore',
      },
    );
  } catch (err) {
    status = (err as { status: number }).status;
  }
  assert.notEqual(status, 2, 'eval.mjs rejected the own cases or the predictions');
  const s = JSON.parse(readFileSync(summary, 'utf8')) as { wrongful: number; missing: number };
  assert.equal(s.wrongful, 0);
  assert.equal(s.missing, 0);
});
