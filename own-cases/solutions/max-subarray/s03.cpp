#include <bits/stdc++.h>
using namespace std;
#define TOP(v) (*max_element((v).begin(), (v).end()))

int main() {
  int n;
  cin >> n;
  vector<long long> a(n), ending(n);
  for (auto& x : a) cin >> x;
  for (int i = 0; i < n; i++) ending[i] = i == 0 ? a[i] : max(a[i], ending[i - 1] + a[i]);
  cout << TOP(ending) << "\n";
}
