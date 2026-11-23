// Attack 4 — memory. Allocates 1 GiB, writes one byte in every page, then reads every page back
// and prints the sum, so the allocation is really used and cannot be optimised away.
// Without a limit it prints 33423360 (the expected output); the sandbox must kill it first (MLE).
#include <cstdio>
#include <cstdlib>

int main() {
  const std::size_t n = std::size_t{1} << 30, page = 4096;
  unsigned char* p = static_cast<unsigned char*>(std::malloc(n));
  if (!p) { std::puts("NOALLOC"); return 0; }
  for (std::size_t i = 0; i < n; i += page) p[i] = static_cast<unsigned char>(i / page);
  unsigned long long sum = 0;
  for (std::size_t i = 0; i < n; i += page) sum += p[i];
  std::printf("%llu\n", sum);
  std::free(p);
}
