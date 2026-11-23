// Attack 7 — root. Prints ROOT if it runs as uid 0 (real or effective), NONROOT otherwise.
#include <cstdio>
#include <unistd.h>

int main() { std::puts(getuid() == 0 || geteuid() == 0 ? "ROOT" : "NONROOT"); }
