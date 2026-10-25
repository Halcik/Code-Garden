#!/bin/bash
set -euo pipefail
# Windows editors may save .env as CRLF. Judge0 sources it as a Bash script;
# normalize a private container copy (load-config prefers /api/judge0.conf).
if [[ -f /judge0.conf ]]; then
  sudo /bin/bash -c 'umask 077; tr -d "\r" < /judge0.conf > /api/judge0.conf; chown judge0:judge0 /api/judge0.conf'
fi
sudo /bin/bash /api/code-garden/setup-cgroups.sh
exec /api/docker-entrypoint.sh "$@"
