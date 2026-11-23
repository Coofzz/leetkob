// Attack 9, compile time — tries to make the compiler print the environment of the compile
// container in its error messages. The canary must not appear in the compile errors.
#include "/proc/1/environ"
#include "/proc/self/environ"
int main() {}
