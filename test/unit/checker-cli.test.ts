// The checker command (rubric criterion 6): one command line takes a dataset folder and writes the
// prediction file of leetkob-eval/README.md. With MODEL_OFF=1 it runs the hard rules only, writes
// `unsure` for every semantic constraint and opens no network connection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/checker/cli.ts';

/** A dataset folder with one made-up problem and two solutions, laid out like the dev set. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'checker-'));
  mkdirSync(join(dir, 'problems', 'count-evens', 'tests'), { recursive: true });
  mkdirSync(join(dir, 'solutions', 'count-evens'), { recursive: true });
  writeFileSync(
    join(dir, 'problems', 'count-evens', 'statement.md'),
    '# Count evens\nPrint how many of n numbers are even.\n',
  );
  writeFileSync(
    join(dir, 'problems', 'count-evens', 'constraints.json'),
    JSON.stringify([
      {
        id: 'C1',
        text: 'Do not call a library counting function: `std::count_if`, `std::count`.',
        deduction: 2,
      },
      { id: 'C2', text: 'Count with a loop you wrote yourself.', deduction: 3 },
    ]),
  );
  writeFileSync(
    join(dir, 'solutions', 'count-evens', 'a1.cpp'),
    [
      '#include <algorithm>',
      '#include <iostream>',
      '#include <vector>',
      'int main() {',
      '  int n; std::cin >> n; std::vector<int> v(n); for (int& x : v) std::cin >> x;',
      '  std::cout << std::count_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }) << "\\n";',
      '}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(dir, 'solutions', 'count-evens', 'a2.cpp'),
    [
      '#include <iostream>',
      '// std::count_if would be shorter',
      'int main() {',
      '  int n, x, c = 0; std::cin >> n;',
      '  while (n--) { std::cin >> x; c += x % 2 == 0; }',
      '  std::cout << c << "\\n";',
      '}',
      '',
    ].join('\n'),
  );
  // The checker must never read the labels: as a directory, reading it would throw.
  mkdirSync(join(dir, 'labels.jsonl'));
  return dir;
}

function readLines(file: string) {
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

test('one line per (solution, constraint): ban lists decided, semantic constraints unsure', async () => {
  const data = fixture();
  const out = join(data, 'predictions.jsonl');
  const code = await main(['--data', data, '--out', out], { MODEL_OFF: '1' });
  assert.equal(code, 0);
  assert.deepEqual(readLines(out), [
    {
      solution: 'count-evens/a1',
      constraint: 'C1',
      verdict: 'violation',
      evidence: [
        {
          line: 6,
          text: '  std::cout << std::count_if(v.begin(), v.end(), [](int x) { return x % 2 == 0; }) << "\\n";',
        },
      ],
    },
    { solution: 'count-evens/a1', constraint: 'C2', verdict: 'unsure', evidence: [] },
    { solution: 'count-evens/a2', constraint: 'C1', verdict: 'pass', evidence: [] },
    { solution: 'count-evens/a2', constraint: 'C2', verdict: 'unsure', evidence: [] },
  ]);
});

test('MODEL_OFF=1 opens no network connection', async () => {
  const savedFetch = globalThis.fetch;
  const savedConnect = net.Socket.prototype.connect;
  globalThis.fetch = () => {
    throw new Error('fetch called with MODEL_OFF=1');
  };
  net.Socket.prototype.connect = () => {
    throw new Error('socket opened with MODEL_OFF=1');
  };
  try {
    const data = fixture();
    assert.equal(await main(['--data', data, '--out', join(data, 'p.jsonl')], { MODEL_OFF: '1' }), 0);
  } finally {
    globalThis.fetch = savedFetch;
    net.Socket.prototype.connect = savedConnect;
  }
});

test('a wrong command line exits with 2 and a usage message, writing nothing', async () => {
  assert.equal(await main([], { MODEL_OFF: '1' }), 2);
  assert.equal(await main(['--data', join(tmpdir(), 'does-not-exist-checker')], { MODEL_OFF: '1' }), 2);
});

test('on the dev set with the model off: eval.mjs accepts the file and finds no wrongful deduction', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'checker-dev-'));
  const out = join(dir, 'predictions.jsonl');
  assert.equal(await main(['--data', 'leetkob-eval', '--out', out], { MODEL_OFF: '1' }), 0);
  const summary = join(dir, 'summary.json');
  let status = 0;
  try {
    execFileSync(
      process.execPath,
      ['leetkob-eval/eval.mjs', '--data', 'leetkob-eval', '--predictions', out, '--json', summary],
      {
        stdio: 'ignore',
      },
    );
  } catch (err) {
    status = (err as { status: number }).status;
  }
  assert.notEqual(status, 2, 'eval.mjs rejected the prediction file');
  const s = JSON.parse(readFileSync(summary, 'utf8')) as { wrongful: number; missing: number; pairs: number };
  assert.equal(s.wrongful, 0);
  assert.equal(s.missing, 0);
});
