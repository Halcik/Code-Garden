#!/bin/bash
set -euo pipefail
if [[ -f /sys/fs/cgroup/cgroup.controllers ]]; then
  # Isolate 2 always accounts CPU for the whole cgroup. Judge0 1.13.1 still
  # passes the removed --cg-timing flag. No resource limit is removed.
  args=()
  for arg in "$@"; do
    [[ "$arg" == --cg-timing ]] || args+=("$arg")
  done
  exec /usr/local/bin/isolate-v2 "${args[@]}"
else
  exec /usr/local/bin/isolate-v1 "$@"
fi
