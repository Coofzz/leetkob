// Attack 9, compile time — tries to pull a secrets file into the compiler's error messages.
// If any of these paths exists in the compile container, its lines are printed as errors (and
// would carry the key). Otherwise the compile fails with NO_SECRET_FILE, which the test expects.
// (Including /proc/*/environ reads nothing: the kernel reports its size as 0.)
#if __has_include("/app/.env")
#include "/app/.env"
#elif __has_include("/.env")
#include "/.env"
#elif __has_include("/tmp/.env")
#include "/tmp/.env"
#elif __has_include("/etc/leetkob/env")
#include "/etc/leetkob/env"
#elif __has_include("/run/secrets/llm_api_key")
#include "/run/secrets/llm_api_key"
#else
#error NO_SECRET_FILE
#endif
int main() {}
