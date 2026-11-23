#include <iostream>
#include <vector>

int main() {
  int n;
  std::cin >> n;
  std::vector<long long> a(n);
  for (auto& x : a) std::cin >> x;
  long long best = a[0];
  for (int i = 0; i < n; i++) {
    long long sum = 0;
    for (int j = i; j < n; j++) {
      sum += a[j];
      if (sum > best) best = sum;
    }
  }
  std::cout << best << "\n";
}
