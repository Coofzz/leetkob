// The judge compares output token by token and ignores whitespace (leetkob-eval/README.md).
const tokens = (s: string) => s.split(/\s+/).filter((t) => t !== '');

export function sameTokens(actual: string, expected: string): boolean {
  const a = tokens(actual);
  const e = tokens(expected);
  return a.length === e.length && a.every((t, i) => t === e[i]);
}
