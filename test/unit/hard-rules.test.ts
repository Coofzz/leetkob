// Hard rules decide ban-list constraints without the model (rubric criterion 3).
// Every snippet here is written for this file; none comes from the dev set (CLAUDE.md, Never).
// A ban list is a constraint whose text starts with "Do not use" or "Do not call"; the banned
// names are the backticked strings in it (leetkob-eval/README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banListNames, decideBanList } from '../../src/checker/hard-rules.ts';

const SORT =
  'Do not call a library sort function: `std::sort`, `std::stable_sort`, `std::ranges::sort`, `qsort`.';
const LOOPS = 'Do not use loop statements: `for`, `while`, `do`-`while`, or `goto`.';
const CONTAINERS = 'Do not use these standard containers: `std::vector`, `std::string`, `std::array`.';
const SEARCH = 'Do not use a library search function: `std::find`, `std::lower_bound`, `bsearch`.';
const REVERSE = 'Do not use reverse iterators: `rbegin`, `rend`, `std::reverse_iterator`.';
const GCD = 'Do not call a library gcd function: `std::gcd`, `__gcd`, `std::__gcd`.';

const code = (...lines: string[]) => lines.join('\n') + '\n';

/** Lines cited as evidence, as numbers. */
function lines(constraint: string, source: string): number[] {
  const r = decideBanList(constraint, source);
  assert.ok(r, 'expected a ban-list constraint');
  return r.evidence.map((e) => e.line);
}
function verdict(constraint: string, source: string) {
  return decideBanList(constraint, source)?.verdict;
}

// ── Which constraints are ban lists ───────────────────────────────────────────

test('a constraint that does not start with "Do not use" / "Do not call" is not a ban list', () => {
  assert.equal(decideBanList('Sort with a merge sort you wrote yourself.', 'int main() {}'), null);
  assert.equal(decideBanList('Reverse in place. Do not use a second buffer.', 'int main() {}'), null);
});

test('banned names are read from the backticks, so any new constraint works', () => {
  assert.deepEqual(banListNames(SORT), ['std::sort', 'std::stable_sort', 'std::ranges::sort', 'qsort']);
  assert.deepEqual(banListNames(LOOPS), ['for', 'while', 'do', 'goto']);
  assert.equal(
    verdict('Do not call `printf`.', code('#include <cstdio>', 'int main() { printf("hi"); }')),
    'violation',
  );
  assert.equal(
    verdict('Do not use `std::accumulate`.', code('#include <numeric>', 'int main() { return 0; }')),
    'pass',
  );
});

// ── Obvious ──────────────────────────────────────────────────────────────────

test('a qualified call is a violation, with the original line as evidence', () => {
  const src = code(
    '#include <algorithm>',
    'int main() {',
    '  int a[3] = {3, 1, 2};',
    '  std::sort(a, a + 3); // sorted here',
    '}',
  );
  const r = decideBanList(SORT, src);
  assert.equal(r?.verdict, 'violation');
  assert.deepEqual(r?.evidence, [{ line: 4, text: '  std::sort(a, a + 3); // sorted here' }]);
});

test('every use is cited, in line order', () => {
  const src = code(
    '#include <algorithm>',
    'void f(int* a) { std::sort(a, a + 2); }',
    'void g(int* a) {',
    '  std::stable_sort(a, a + 2);',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [2, 4]);
});

// ── Disguised: using, alias, macro, ADL, function pointer ────────────────────

test('using namespace std, then an unqualified call', () => {
  const src = code(
    '#include <algorithm>',
    '#include <vector>',
    'using namespace std;',
    'int main() {',
    '  vector<int> v{2, 1};',
    '  sort(v.begin(), v.end());',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [6]);
});

test('a using-declaration, then an unqualified call', () => {
  const src = code(
    '#include <algorithm>',
    'using std::stable_sort;',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  stable_sort(a, a + 2);',
    '}',
  );
  assert.ok(lines(SORT, src).includes(5));
});

test('a namespace alias of std', () => {
  const src = code(
    '#include <algorithm>',
    'namespace s = std;',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  s::sort(a, a + 2);',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [5]);
});

test('std::ranges through using namespace std, and through an alias', () => {
  const viaUsing = code(
    '#include <algorithm>',
    '#include <vector>',
    'using namespace std;',
    'int main() {',
    '  vector<int> v{2, 1};',
    '  ranges::sort(v);',
    '}',
  );
  assert.deepEqual(lines(SORT, viaUsing), [6]);
  const viaAlias = code(
    '#include <algorithm>',
    '#include <vector>',
    'namespace rg = std::ranges;',
    'int main() {',
    '  std::vector<int> v{2, 1};',
    '  rg::sort(v);',
    '}',
  );
  assert.deepEqual(lines(SORT, viaAlias), [6]);
});

test('a macro hides the call: the definition and the use are both cited', () => {
  const src = code(
    '#include <algorithm>',
    '#define ORDER(p, n) std::sort(p, p + n)',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  ORDER(a, 2);',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [2, 5]);
});

test('a multi-line macro cites the physical line of the banned name', () => {
  const src = code(
    '#include <algorithm>',
    '#define ORDER_ALL(v) \\',
    '  std::sort((v).begin(), (v).end())',
    'int main() {}',
  );
  assert.deepEqual(lines(SORT, src), [3]);
});

test('an unqualified call found by argument-dependent lookup, without any using', () => {
  const src = code(
    '#include <algorithm>',
    '#include <vector>',
    'int main() {',
    '  std::vector<int> v{2, 1};',
    '  sort(v.begin(), v.end());',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [5]);
});

test('taking the address of a banned function', () => {
  const src = code(
    '#include <algorithm>',
    'int main() {',
    '  auto order = std::stable_sort<int*>;',
    '  int a[2] = {2, 1};',
    '  order(a, a + 2);',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [3]);
});

test('a banned name that is not in std is matched as a plain name', () => {
  const src = code(
    '#include <cstdlib>',
    'int cmp(const void* x, const void* y) { return *(int*)x - *(int*)y; }',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  qsort(a, 2, sizeof(int), cmp);',
    '  ::qsort(a, 2, sizeof(int), cmp);',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [5, 6]);
});

// ── Traps: compliant code a naive check would flag ───────────────────────────

test('trap: the student’s own sort in their own namespace', () => {
  const src = code(
    'namespace mine {',
    'void sort(int* a, int n) { (void)a; (void)n; }',
    '}',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  mine::sort(a, 2);',
    '}',
  );
  assert.equal(verdict(SORT, src), 'pass');
});

test('trap: the student’s own global sort, with or without using namespace std', () => {
  const plain = code(
    'void sort(int* a, int n) { (void)a; (void)n; }',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  sort(a, 2);',
    '}',
  );
  assert.equal(verdict(SORT, plain), 'pass');
  const withUsing = code(
    '#include <iostream>',
    'using namespace std;',
    'void sort(int* a, int n) { (void)a; (void)n; }',
    'int main() {',
    '  int a[2] = {2, 1};',
    '  sort(a, 2);',
    '}',
  );
  assert.equal(verdict(SORT, withUsing), 'pass');
});

test('trap: banned names inside comments and string literals', () => {
  const src = code(
    '#include <cstdio>',
    '// std::sort is not allowed, so we merge by hand',
    '/* qsort would be',
    '   std::stable_sort( */',
    'int main() {',
    '  std::puts("std::sort(a, a + n);");',
    '  const char* r = R"(std::ranges::sort)";',
    "  char c = 's';",
    '  (void)r; (void)c;',
    '}',
  );
  assert.equal(verdict(SORT, src), 'pass');
});

test('trap: <algorithm> included only for std::swap', () => {
  const src = code('#include <algorithm>', 'int main() {', '  int a = 1, b = 2;', '  std::swap(a, b);', '}');
  assert.equal(verdict(SORT, src), 'pass');
});

test('trap: a member function with a banned name is not the library function', () => {
  const src = code(
    '#include <string>',
    'int main() {',
    '  std::string s = "abc";',
    "  return s.find('b') == std::string::npos;",
    '}',
  );
  assert.equal(verdict(SEARCH, src), 'pass');
  const lib = code(
    '#include <algorithm>',
    '#include <vector>',
    'int main() {',
    '  std::vector<int> v{1, 2};',
    '  return std::find(v.begin(), v.end(), 2) == v.end();',
    '}',
  );
  assert.deepEqual(lines(SEARCH, lib), [5]);
});

test('trap: the student’s own variables and functions named like banned things', () => {
  const src = code(
    '#include <iostream>',
    'using namespace std;',
    'long long gcd(long long a, long long b) { return b == 0 ? a : gcd(b, a % b); }',
    'int main() {',
    '  long long x, y;',
    '  cin >> x >> y;',
    '  cout << gcd(x, y) << endl;',
    '}',
  );
  assert.equal(verdict(GCD, src), 'pass');
  const array = code('int main() {', '  int array[4] = {0};', '  return array[0];', '}');
  assert.equal(verdict(CONTAINERS, array), 'pass');
});

test('trap: a header included but never used is not a use', () => {
  assert.equal(
    verdict(CONTAINERS, code('#include <vector>', '#include <string>', 'int main() { return 0; }')),
    'pass',
  );
});

// ── Other kinds of banned names ──────────────────────────────────────────────

test('loop keywords are violations wherever they appear in code', () => {
  const loop = code(
    'int main() {',
    '  int s = 0;',
    '  for (int i = 0; i < 3; i++) s += i;',
    '  do { s--; } while (s > 0);',
    '  return s;',
    '}',
  );
  assert.deepEqual(lines(LOOPS, loop), [3, 4]);
  const jump = code(
    'int main() {',
    '  int i = 0;',
    'again:',
    '  if (++i < 3) goto again;',
    '  return i;',
    '}',
  );
  assert.deepEqual(lines(LOOPS, jump), [4]);
});

test('trap: recursion only, with loop words in comments, strings and longer names', () => {
  const src = code(
    '#include <cstdio>',
    '// no for, no while: recursion does the work',
    'int forward_sum(int n) { return n == 0 ? 0 : n + forward_sum(n - 1); }',
    'int main() {',
    '  int do_it = forward_sum(3);',
    '  std::printf("for %d\\n", do_it);',
    '}',
  );
  assert.equal(verdict(LOOPS, src), 'pass');
});

test('containers: qualified, through using namespace std, and in a type alias', () => {
  const src = code(
    '#include <vector>',
    '#include <string>',
    'using namespace std;',
    'using Row = std::vector<int>;',
    'int main() {',
    '  vector<int> v;',
    '  string s;',
    '  return (int)v.size() + (int)s.size();',
    '}',
  );
  assert.deepEqual(lines(CONTAINERS, src), [4, 6, 7]);
});

test('plain banned names are violations as member calls too', () => {
  const src = code(
    '#include <string>',
    'int main() {',
    '  std::string s = "ab";',
    '  std::string t(s.rbegin(), s.rend());',
    '  return (int)t.size();',
    '}',
  );
  assert.deepEqual(lines(REVERSE, src), [4]);
});

test('a name banned both plain and qualified', () => {
  const src = code(
    '#include <algorithm>',
    '#include <numeric>',
    'int main() {',
    '  int a = std::gcd(4, 6);',
    '  int b = __gcd(4, 6);',
    '  return a + b;',
    '}',
  );
  assert.deepEqual(lines(GCD, src), [4, 5]);
});

// ── The lexer keeps line numbers right ───────────────────────────────────────

test('digit separators, escaped quotes and multi-line comments do not shift the lines', () => {
  const src = code(
    '#include <algorithm>',
    'int main() {',
    "  int big = 1'000'000;",
    "  char q = '\\'';",
    '  const char* s = "a \\" std::sort \\" b";',
    '  /* one',
    '     two */ int a[2] = {2, 1};',
    '  std::sort(a, a + 2);',
    '  return big + q + s[0];',
    '}',
  );
  assert.deepEqual(lines(SORT, src), [8]);
});

test('CRLF line endings give the same lines and the text without the carriage return', () => {
  const src = '#include <algorithm>\r\nint main() {\r\n  int a[1] = {1};\r\n  std::sort(a, a + 1);\r\n}\r\n';
  assert.deepEqual(decideBanList(SORT, src)?.evidence, [{ line: 4, text: '  std::sort(a, a + 1);' }]);
});

test('a dereferenced or address-taken call is a use, not a declaration of the student\u2019s own function', () => {
  const MAX = 'Do not use `std::max_element`, `std::min_element`.';
  const deref = code(
    '#include <algorithm>',
    '#include <vector>',
    'using namespace std;',
    'int top(vector<int>& v) {',
    '  return *max_element(v.begin(), v.end());',
    '}',
  );
  assert.deepEqual(lines(MAX, deref), [5]);
  const sum = code(
    '#include <algorithm>',
    '#include <vector>',
    'using namespace std;',
    'int span(vector<int>& v) {',
    '  return *max_element(v.begin(), v.end()) - *min_element(v.begin(), v.end());',
    '}',
  );
  assert.deepEqual(lines(MAX, sum), [5]);
});

test('trap: a function of the student\u2019s that returns a pointer is still the student\u2019s own', () => {
  const MAX = 'Do not use `std::max_element`.';
  const src = code(
    'int* max_element(int* first, int* last) {',
    '  int* best = first;',
    '  for (int* p = first; p != last; ++p) if (*p > *best) best = p;',
    '  return best;',
    '}',
    'int main() {',
    '  int a[3] = {1, 3, 2};',
    '  return *max_element(a, a + 3);',
    '}',
  );
  assert.equal(verdict(MAX, src), 'pass');
});
