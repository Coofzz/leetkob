#!/usr/bin/env node
// Verifies that leetkob-eval/ is byte-for-byte the published dev set.
// Zero dependencies. Usage: node scripts/verify-devset.mjs [devsetDir] [manifest]
// Exit 0 = identical, 1 = mismatch, 2 = usage / setup error.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Trust anchors printed in the PA#3 rubric. They guard the manifest itself:
// if someone regenerates the manifest from a broken copy, this still fails.
const ANCHORS = { 'eval.mjs': 'c836edd8713521bb', 'labels.jsonl': '262cda7b0ef5612e' };

const dir = process.argv[2] ?? 'leetkob-eval';
const manifestPath = process.argv[3] ?? 'leetkob-eval.sha256';

if (!existsSync(dir) || !existsSync(manifestPath)) {
  console.error(`verify-devset: missing ${!existsSync(dir) ? dir : manifestPath}`);
  process.exit(2);
}

const expected = new Map();
for (const line of readFileSync(manifestPath, 'utf8').split('\n')) {
  const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/);
  if (m) expected.set(m[2], m[1]);
}

const problems = [];
for (const [file, prefix] of Object.entries(ANCHORS)) {
  if (!expected.get(file)?.startsWith(prefix)) {
    problems.push(
      `manifest: ${file} does not match the rubric anchor ${prefix} (manifest was tampered with)`,
    );
  }
}

const walk = (d) =>
  readdirSync(d).flatMap((name) => {
    if (name === '.git') return [];
    const p = join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(dir, p).split(sep).join('/')];
  });
const actual = new Set(walk(dir));

for (const [file, hash] of expected) {
  if (!actual.has(file)) {
    problems.push(`missing:  ${file}`);
    continue;
  }
  const buf = readFileSync(join(dir, file));
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== hash) {
    const crlf = buf.includes('\r\n');
    problems.push(
      `changed:  ${file}${crlf ? '  <- contains CRLF: Git autocrlf converted it, see docs/devset-integrity.md' : ''}`,
    );
  }
}
for (const file of actual)
  if (!expected.has(file)) problems.push(`extra:    ${file}  (put your own cases in a separate folder)`);

if (problems.length) {
  console.error(`verify-devset: ${dir} is NOT the published dev set (${problems.length} problem(s)):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
process.stdout.write(
  `verify-devset: OK, ${expected.size} files byte-for-byte identical (eval.mjs ${ANCHORS['eval.mjs']}, labels.jsonl ${ANCHORS['labels.jsonl']})\n`,
);
