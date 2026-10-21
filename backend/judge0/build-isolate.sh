#!/bin/bash
set -euo pipefail
mkdir -p /tmp/code-garden-isolate
cd /tmp/code-garden-isolate
curl -fSL --retry 5 https://ftp.gnu.org/gnu/gperf/gperf-3.1.tar.gz -o gperf.tar.gz
echo '588546b945bba4b70b6a3a616e80b4ab466e3f33024a352fc2198112cdbb3ae2  gperf.tar.gz' | sha256sum --check --strict
tar -xzf gperf.tar.gz
cd gperf-3.1
./configure --prefix=/tmp/gperf
make -j"${BUILD_JOBS:-2}"
make install
export PATH="/tmp/gperf/bin:$PATH"
cd ..
curl -fSL --retry 5 https://github.com/seccomp/libseccomp/releases/download/v2.6.0/libseccomp-2.6.0.tar.gz -o seccomp.tar.gz
echo '83b6085232d1588c379dc9b9cae47bb37407cf262e6e74993c61ba72d2a784dc  seccomp.tar.gz' | sha256sum --check --strict
tar -xzf seccomp.tar.gz
cd libseccomp-2.6.0
./configure --prefix=/tmp/seccomp --disable-shared --enable-static --disable-python
make -j"${BUILD_JOBS:-2}"
make install
cd ..
curl -fSL --retry 5 https://codeload.github.com/ioi/isolate/tar.gz/refs/tags/v2.6 -o isolate.tar.gz
echo '061961d32af1017219c5141c6a33fc12550fc4e2de5b9c8da48568d083a0930b  isolate.tar.gz' | sha256sum --check --strict
tar -xzf isolate.tar.gz
cd isolate-2.6
# Docker delegates the cgroup subtree, so systemd/cg-keeper is unnecessary.
# Static libseccomp avoids replacing Buster runtime libraries. Buster's headers
# predate io_uring/quotactl_fd; 425 and 443 are their stable Linux amd64 syscall
# numbers (Linux arch/x86/entry/syscalls/syscall_64.tbl). io_uring is DENIED.
make -j"${BUILD_JOBS:-2}" isolate CONFIGDIR=/usr/local/etc/isolate-v2 \
  CFLAGS_EXTRA='-I/tmp/seccomp/include -D__NR_io_uring_setup=425 -DSYS_quotactl_fd=443' LIBS='/tmp/seccomp/lib/libseccomp.a -lcap'
mkdir -p /code-garden-isolate
cp isolate /code-garden-isolate/isolate-v2
