// Attack 2 — CPU time. Spins forever. The sandbox must stop it at the CPU limit (TLE).
int main() {
  volatile unsigned long long x = 0;
  for (;;) x = x + 1;
}
