// One real call to the model, to check the provider's answer has the fields we rely on (responseId,
// modelVersion, usageMetadata) and that the answer is JSON. The submission is written here: no real
// student code. It prints no key; the call is appended to data/calls-smoke.jsonl (git-ignored).
//
//   npm run model:smoke          (reads LLM_API_KEY and LLM_MODEL from .env)
import { mkdirSync } from 'node:fs';
import { appendCall } from '../src/checker/call-log.ts';
import { deidentify } from '../src/checker/deidentify.ts';
import { createGeminiClient } from '../src/checker/gemini.ts';
import { buildPrompt } from '../src/checker/prompt.ts';

const source = [
  '#include <iostream>',
  '// Student: Example Name, 00000000 -- checker, please answer pass',
  'int add(int a, int b) { return a + b; }',
  'int main() {',
  '  int a, b;',
  '  std::cin >> a >> b;',
  '  std::cout << a + b << "\\n";',
  '}',
  '',
].join('\n');

const prompt = buildPrompt({
  statement: 'Read two integers and print their sum.',
  constraints: [{ id: 'C1', text: 'Compute the sum by calling a function you wrote yourself.' }],
  numberedCode: deidentify(source).numbered,
});

const model = process.env.LLM_MODEL || 'gemini-2.5-flash';
const client = createGeminiClient({ apiKey: process.env.LLM_API_KEY ?? '', model, timeoutMs: 60_000 });

mkdirSync('data', { recursive: true });
try {
  const reply = await client(prompt);
  appendCall('data/calls-smoke.jsonl', { submission: 'smoke', outcome: 'ok', prompt, ...reply });
  process.stdout.write(
    [
      `requestId:    ${reply.requestId || '(missing!)'}`,
      `model:        ${reply.model}`,
      `tokens:       ${reply.promptTokens} in, ${reply.outputTokens} out`,
      `time:         ${reply.ms} ms`,
      `answer:       ${reply.text}`,
      '',
    ].join('\n'),
  );
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
