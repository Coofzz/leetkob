// Attack 3 — wall clock. Uses no CPU, so a CPU limit never fires. The parent sleeps; a child
// ignores SIGTERM, keeps stdout open and sleeps too, so killing the parent alone is not enough.
// The sandbox must kill the whole container within the job's wall-clock budget.
#include <csignal>
#include <unistd.h>

int main() {
  if (fork() == 0) {
    signal(SIGTERM, SIG_IGN);
    for (;;) sleep(60);
  }
  for (;;) sleep(60);
}
