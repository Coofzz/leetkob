// Attack 5 — processes. Forks until fork() fails or 200 children exist; each child closes stdout
// and waits. Prints LIMITED if fork() was refused before 200, UNLIMITED otherwise. Kills its
// children before it exits. The sandbox's process limit (16, FAQ-05) must leave it LIMITED.
#include <csignal>
#include <cstdio>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

int main() {
  std::vector<pid_t> kids;
  while (kids.size() < 200) {
    pid_t pid = fork();
    if (pid < 0) break;
    if (pid == 0) {
      close(1);
      for (;;) pause();
    }
    kids.push_back(pid);
  }
  for (pid_t k : kids) kill(k, SIGKILL);
  for (pid_t k : kids) waitpid(k, nullptr, 0);
  std::puts(kids.size() < 200 ? "LIMITED" : "UNLIMITED");
}
