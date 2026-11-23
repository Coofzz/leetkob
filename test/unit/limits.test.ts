// The two limits on the model (rubric criterion 5): its output is checked against the answer schema,
// and it has a timeout. Anything that fails either becomes `unsure` with a reason (FAQ-09), never a
// verdict. Every test uses a fake model client: no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ModelClient, ModelReply } from '../../src/checker/gemini.ts';
import { ModelTimeoutError } from '../../src/checker/gemini.ts';
import { createSemanticReview } from '../../src/checker/semantic.ts';
import { createReview } from '../../src/checker/review.ts';
import { main } from '../../src/checker/cli.ts';
import type { CallEntry } from '../../src/checker/call-log.ts';
import type { ReviewInput } from '../../src/types.ts';

const source = [
  '#include <iostream>', //                          1
  'int add(int a, int b) { return a + b; }', //      2
  'int main() {', //                                 3
  '  int a, b; std::cin >> a >> b; // read', //      4
  '  std::cout << a + b << "\\n";', //               5
  '}', //                                            6
  '',
].join('\n');

const input: ReviewInput = {
  statement: 'Print the sum of two integers.',
  constraints: [
    { id: 'C1', text: 'Add the numbers by calling a function you wrote yourself.' },
    { id: 'C2', text: 'Read the input with a function you wrote yourself.' },
  ],
  source,
};

function reply(text: string): ModelReply {
  return { text, requestId: 'r-1', model: 'fake', promptTokens: 10, outputTokens: 5, ms: 1 };
}
const answering =
  (text: string): ModelClient =>
  async () =>
    reply(text);
const json = (v: unknown) => JSON.stringify(v);
const good = (constraint: string, extra: object = {}) => ({
  constraint,
  verdict: 'pass',
  evidence: [],
  reason: 'ok',
  ...extra,
});

async function review(client: ModelClient, timeoutMs = 1000) {
  const results = await createSemanticReview({ client, timeoutMs })(input);
  return Object.fromEntries(results.map((r) => [r.constraint, r]));
}

// ── Schema ───────────────────────────────────────────────────────────────────

test('an answer that is not JSON makes every constraint unsure (schema)', async () => {
  const r = await review(answering('Sure! C1 passes.'));
  assert.equal(r.C1?.verdict, 'unsure');
  assert.equal(r.C1?.unsureReason, 'schema');
  assert.equal(r.C2?.unsureReason, 'schema');
});

test('JSON without a verdicts array makes every constraint unsure (schema)', async () => {
  for (const text of [json({}), json({ verdicts: 'pass' }), json([good('C1')]), 'null']) {
    const r = await review(answering(text));
    assert.equal(r.C1?.unsureReason, 'schema', text);
    assert.equal(r.C2?.unsureReason, 'schema', text);
  }
});

test('an unknown verdict breaks only its own constraint', async () => {
  const r = await review(answering(json({ verdicts: [good('C1', { verdict: 'maybe' }), good('C2')] })));
  assert.equal(r.C1?.verdict, 'unsure');
  assert.equal(r.C1?.unsureReason, 'schema');
  assert.equal(r.C2?.verdict, 'pass');
});

test('a field the schema does not have — such as a deduction — is rejected, wherever it is', async () => {
  const inItem = await review(answering(json({ verdicts: [good('C1', { deduction: 3 }), good('C2')] })));
  assert.equal(inItem.C1?.unsureReason, 'schema');
  assert.equal(inItem.C2?.verdict, 'pass');
  const atTop = await review(answering(json({ verdicts: [good('C1'), good('C2')], score: 7 })));
  assert.equal(atTop.C1?.unsureReason, 'schema');
  assert.equal(atTop.C2?.unsureReason, 'schema');
});

test('an unknown constraint is ignored; a missing or repeated one is unsure (schema)', async () => {
  const r = await review(answering(json({ verdicts: [good('C9'), good('C2'), good('C2')] })));
  assert.equal(r.C1?.unsureReason, 'schema');
  assert.equal(r.C2?.unsureReason, 'schema');
  assert.deepEqual(Object.keys(r).sort(), ['C1', 'C2']);
});

test('wrong types inside an item are rejected', async () => {
  const bad = [
    good('C1', { evidence: 'line 2' }),
    good('C1', { evidence: [{ line: '2', text: 'x' }] }),
    good('C1', { evidence: [{ line: 0, text: 'x' }] }),
    good('C1', { reason: 42 }),
    { constraint: 'C1', verdict: 'pass' },
  ];
  for (const item of bad) {
    const r = await review(answering(json({ verdicts: [item, good('C2')] })));
    assert.equal(r.C1?.unsureReason, 'schema', json(item));
    assert.equal(r.C2?.verdict, 'pass');
  }
});

// ── Evidence ─────────────────────────────────────────────────────────────────

test('a violation cites the ORIGINAL line, comment included, when the model copied the line it saw', async () => {
  const r = await review(
    answering(
      json({
        verdicts: [
          good('C1'),
          good('C2', {
            verdict: 'violation',
            evidence: [{ line: 4, text: 'int a, b; std::cin >> a >> b;' }],
            reason: 'reads with std::cin',
          }),
        ],
      }),
    ),
  );
  assert.equal(r.C2?.verdict, 'violation');
  assert.equal(r.C2?.source, 'model');
  assert.deepEqual(r.C2?.evidence, [{ line: 4, text: '  int a, b; std::cin >> a >> b; // read' }]);
});

test('evidence that does not match the code, or a violation without evidence, is unsure (evidence-mismatch)', async () => {
  const cases = [[{ line: 4, text: 'std::sort(a, a + n);' }], [{ line: 99, text: 'int main() {' }], []];
  for (const evidence of cases) {
    const r = await review(
      answering(json({ verdicts: [good('C1'), good('C2', { verdict: 'violation', evidence })] })),
    );
    assert.equal(r.C2?.verdict, 'unsure', json(evidence));
    assert.equal(r.C2?.unsureReason, 'evidence-mismatch');
    assert.equal(r.C1?.verdict, 'pass');
  }
});

test('the model’s own unsure keeps its reason; a pass carries no evidence', async () => {
  const r = await review(
    answering(
      json({
        verdicts: [
          good('C1', { evidence: [{ line: 2, text: 'int add(int a, int b) { return a + b; }' }] }),
          good('C2', { verdict: 'unsure', reason: 'cannot tell how input is read' }),
        ],
      }),
    ),
  );
  assert.deepEqual(r.C1?.evidence, []);
  assert.equal(r.C2?.unsureReason, 'model-unsure');
  assert.equal(r.C2?.reason, 'cannot tell how input is read');
});

// ── Timeout and errors ───────────────────────────────────────────────────────

test('a model slower than the timeout makes every constraint unsure (timeout), and the review returns at once', async () => {
  const slow: ModelClient = () =>
    new Promise((resolve) => setTimeout(() => resolve(reply(json({ verdicts: [] }))), 300));
  const started = Date.now();
  const r = await review(slow, 50);
  assert.ok(Date.now() - started < 200, `took ${Date.now() - started} ms`);
  assert.equal(r.C1?.unsureReason, 'timeout');
  assert.equal(r.C2?.unsureReason, 'timeout');
});

test('a client that reports its own timeout, or fails, gives unsure with that reason', async () => {
  const timedOut = await review(async () => {
    throw new ModelTimeoutError(10);
  });
  assert.equal(timedOut.C1?.unsureReason, 'timeout');
  const failed = await review(async () => {
    throw new Error('the model provider answered HTTP 429');
  });
  assert.equal(failed.C1?.unsureReason, 'model-error');
});

// ── Wiring: hard rules first, the call log, the command ──────────────────────

test('a constraint a hard rule decides is never sent to the model, and the call log says so', async () => {
  const prompts: string[] = [];
  const calls: Omit<CallEntry, 'submission'>[] = [];
  const client: ModelClient = async (prompt) => {
    prompts.push(prompt.user);
    return reply(json({ verdicts: [good('C2')] }));
  };
  const reviewFn = createReview(
    createSemanticReview({ client, timeoutMs: 1000, onCall: (e) => calls.push(e) }),
  );
  const results = await reviewFn(
    {
      ...input,
      constraints: [
        { id: 'C1', text: 'Do not use `std::cin`.' },
        { id: 'C2', text: 'Add with a function you wrote yourself.' },
      ],
    },
    { modelOff: false },
  );
  assert.equal(results[0]?.source, 'hard-rule');
  assert.equal(results[0]?.verdict, 'violation');
  assert.equal(results[1]?.source, 'model');
  assert.equal(prompts.length, 1);
  assert.ok(!prompts[0]?.includes('std::cin`'), 'the ban-list constraint reached the model');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.requestId, 'r-1');
  assert.deepEqual(calls[0]?.skippedByHardRules, ['C1']);
});

test('without MODEL_OFF the command needs a key, and says so with exit code 2', async () => {
  assert.equal(await main(['--data', 'leetkob-eval'], {}), 2);
});
