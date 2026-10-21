#!/bin/bash
set -euo pipefail
series="${1:?Expected Python series}"
manifest=/code-garden-build/versions.json
version="$(ruby -rjson -e 'puts JSON.parse(File.read(ARGV[0])).find { |v| v["series"] == ARGV[1] }.fetch("version")' "$manifest" "$series")"
sha256="$(ruby -rjson -e 'puts JSON.parse(File.read(ARGV[0])).find { |v| v["series"] == ARGV[1] }.fetch("sha256")' "$manifest" "$series")"
prefix="/usr/local/code-garden/python-${series}"
mkdir -p /tmp/code-garden-python
cd /tmp/code-garden-python
curl --fail --show-error --location --retry 5 \
  "https://www.python.org/ftp/python/${version}/Python-${version}.tar.xz" -o python.tar.xz
printf '%s  python.tar.xz\n' "$sha256" | sha256sum --check --strict
tar -xJf python.tar.xz
cd "Python-${version}"
# No apt on the EOL Buster base, no system Python replacement, no shared libpython
# or compiler-runtime dependencies from a different distribution.
./configure --prefix="$prefix" --without-ensurepip
make -j"${BUILD_JOBS:-2}"
make altinstall COMPILEALL_OPTS=-j1
"${prefix}/bin/python${series}" -I -c \
  "import sys, ssl, hashlib, ctypes, sqlite3, bz2, lzma, zlib; assert sys.version_info[:2] == tuple(map(int, '${series}'.split('.'))); print(sys.version)"
rm -rf /tmp/code-garden-python
