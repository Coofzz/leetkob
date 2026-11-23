// Attack 1 — network. Tries to open a TCP connection to 1.1.1.1:80.
// Prints CONNECTED if it got out, BLOCKED otherwise. The sandbox must leave it BLOCKED.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdio>

int main() {
  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) { std::puts("BLOCKED"); return 0; }
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(80);
  inet_pton(AF_INET, "1.1.1.1", &addr.sin_addr);
  bool connected = connect(s, reinterpret_cast<sockaddr*>(&addr), sizeof addr) == 0;
  std::puts(connected ? "CONNECTED" : "BLOCKED");
  close(s);
}
