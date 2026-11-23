#!/bin/bash
# Runs inside the judging container (src/sandbox/runner.ts starts it): uid 65534, read-only root,
# /tmp is the only writable place, no network. Two modes, one container each:
#
#   judge-run compile                     stdin: the C++ source.
#                                         stdout: the binary; stderr: compiler errors (max 4 KiB).
#   judge-run run <cpu s> <wall s> <out B> stdin: a tar of a.out and NNN.in files.
#                                         stdout: one JSON line per test, in order.
#
# Expected outputs never enter the container; the runner compares outside.
set -u
cd /tmp || exit 2

case "${1:-}" in
compile)
  cat > main.cpp
  timeout -s KILL 10 g++ -std=c++17 -O2 -o a.out main.cpp 2> err.txt
  code=$?
  if [ "$code" -eq 0 ]; then
    cat a.out
    exit 0
  fi
  [ "$code" -eq 137 ] && echo "compilation took longer than 10 s" >> err.txt
  head -c 4096 err.txt >&2
  exit 1
  ;;
run)
  cpu=$2 wall=$3 limit=$4
  mkdir w && cd w && tar -xf - || exit 2
  # The container's own cgroup (cgroup v2): oom_kill counts processes the memory limit killed.
  oom_kills() { sed -n 's/^oom_kill //p' /sys/fs/cgroup/memory.events 2>/dev/null || echo 0; }
  for input in $(ls -- *.in | sort); do
    idx=$((10#${input%.in}))
    before=$(oom_kills)
    start=$(date +%s%N)
    # CPU: SIGXCPU at the soft limit, SIGKILL one second later. Wall: timeout kills the program.
    # Output: head keeps limit+1 bytes, so "more than the limit" is visible, then closes the pipe.
    (ulimit -S -t "$cpu"; ulimit -H -t "$((cpu + 1))"; exec timeout -s KILL "$wall" ./a.out < "$input" 2> /dev/null) |
      head -c "$((limit + 1))" > out
    status=${PIPESTATUS[0]}
    end=$(date +%s%N)
    after=$(oom_kills)
    oom=false
    [ "${after:-0}" != "${before:-0}" ] && oom=true
    bytes=$(stat -c %s out)
    printf '{"idx":%d,"exit":%d,"oom":%s,"ms":%d,"bytes":%d,"out":"%s"}\n' \
      "$idx" "$status" "$oom" "$(((end - start) / 1000000))" "$bytes" "$(head -c "$limit" out | base64 -w0)"
  done
  ;;
*)
  echo "usage: judge-run compile | judge-run run <cpu s> <wall s> <output bytes>" >&2
  exit 2
  ;;
esac
