#include <cstdio>

static long long best;

// Reads the remaining k numbers; `ending` is the best sum of a subarray ending at the previous number.
static void scan(int k, long long ending, bool first) {
  if (k == 0) return;
  long long x;
  if (std::scanf("%lld", &x) != 1) return;
  ending = first || ending < 0 ? x : ending + x;
  if (first || ending > best) best = ending;
  scan(k - 1, ending, false);
}

int main() {
  int n;
  if (std::scanf("%d", &n) != 1) return 0;
  scan(n, 0, true);
  std::printf("%lld\n", best);
}
