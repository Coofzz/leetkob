// Attack 6 — output. Prints forever. The sandbox must cut it at 1 MB (FAQ-05) and stop it.
#include <cstdio>

int main() {
  for (;;) std::fputs("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n", stdout);
}
