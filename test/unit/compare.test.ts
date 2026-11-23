import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameTokens } from '../../src/sandbox/compare.ts';

// The judge compares output token by token and ignores whitespace (leetkob-eval/README.md).

test('sameTokens ignores spaces, tabs, newlines and a missing final newline', () => {
  assert.equal(sameTokens('1 2 3\n', '1  2\t3'), true);
  assert.equal(sameTokens('1\r\n2\r\n', '1\n2'), true);
  assert.equal(sameTokens('\n\n  7  \n', '7'), true);
  assert.equal(sameTokens('', '   \n'), true);
});

test('sameTokens tells different tokens apart', () => {
  assert.equal(sameTokens('1 2', '12'), false);
  assert.equal(sameTokens('1 2', '1 2 3'), false);
  assert.equal(sameTokens('abc', 'ABC'), false);
  assert.equal(sameTokens('1.0', '1'), false);
});
