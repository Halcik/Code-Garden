#!/bin/bash
set -euo pipefail
[[ -f /sys/fs/cgroup/cgroup.controllers ]] || exit 0
root=/sys/fs/cgroup
[[ "$(cat /proc/self/cgroup)" == '0::/' ]] || {
  echo 'Judge0 requires a private cgroup namespace (compose cgroup: private).' >&2
  exit 1
}
# This is the container's own namespace, NOT the host cgroup hierarchy.
# Move runtime processes into a child before enabling controllers: cgroup v2
# forbids internal processes in a resource-distributing cgroup.
mkdir -p "$root/code-garden-runtime"
# Snapshot first: moving a PID while reading cgroup.procs can skip later entries.
mapfile -t runtime_pids < "$root/cgroup.procs"
for pid in "${runtime_pids[@]}"; do
  if ! echo "$pid" > "$root/code-garden-runtime/cgroup.procs"; then
    [[ ! -d "/proc/$pid" ]] || exit 1
  fi
done
echo '+cpu +cpuset +memory' > "$root/cgroup.subtree_control"
mkdir -p "$root/code-garden-boxes"
echo '+cpu +cpuset +memory' > "$root/code-garden-boxes/cgroup.subtree_control"
test -f "$root/code-garden-boxes/memory.max"
test -f "$root/code-garden-boxes/cpu.stat"
