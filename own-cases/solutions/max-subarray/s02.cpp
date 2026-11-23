#include <iostream>

// Kadane's algorithm. No std::max_element or std::accumulate here.
namespace mine {
long long accumulate(long long current, long long x) { return current + x > x ? current + x : x; }
}  // namespace mine

int main() {
  int n;
  std::cin >> n;
  long long x, current = 0, best = 0;
  for (int i = 0; i < n; i++) {
    std::cin >> x;
    current = i == 0 ? x : mine::accumulate(current, x);
    if (i == 0 || current > best) best = current;
  }
  std::cout << best << "\n";
}
