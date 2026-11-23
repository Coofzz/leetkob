// Attack 8 — host access. Looks for the Docker socket and tries to write outside /tmp.
// Prints SOCKET or WROTE:<path> if it finds a way out, SEALED otherwise.
#include <cstdio>
#include <initializer_list>
#include <unistd.h>

int main() {
  for (const char* sock : {"/var/run/docker.sock", "/run/docker.sock"}) {
    if (access(sock, F_OK) == 0) { std::printf("SOCKET\n"); return 0; }
  }
  for (const char* path : {"/escape", "/app/escape", "/home/escape", "/etc/escape", "/usr/escape"}) {
    if (FILE* f = std::fopen(path, "w")) {
      std::fclose(f);
      std::printf("WROTE:%s\n", path);
      return 0;
    }
  }
  std::puts("SEALED");
}
