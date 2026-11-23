#include <algorithm>
#include <iostream>
#include <vector>

int main() {
  int n;
  std::cin >> n;
  std::vector<long long> a(n), best(n);
  for (auto& x : a) std::cin >> x;
  best[0] = a[0];
  for (int i = 1; i < n; i++) best[i] = std::max(a[i], best[i - 1] + a[i]);
  std::cout << *std::max_element(best.begin(), best.end()) << "\n";
}
