# syntax=docker/dockerfile:1
# All build/runtime stages share the same libc and development libraries.
FROM judge0/judge0:1.13.1@sha256:6b5d6a66aa19a8e878a52ea3c6a560afc1086734d96e2885b561fd5c6018f082 AS compiler
USER root
ARG BUILD_JOBS=2
COPY versions.json build-python.sh /code-garden-build/

FROM compiler AS python311
RUN bash /code-garden-build/build-python.sh 3.11
FROM compiler AS python312
RUN bash /code-garden-build/build-python.sh 3.12
FROM compiler AS python313
RUN bash /code-garden-build/build-python.sh 3.13
FROM compiler AS python314
RUN bash /code-garden-build/build-python.sh 3.14

FROM compiler AS isolate2
COPY build-isolate.sh /code-garden-build/
RUN bash /code-garden-build/build-isolate.sh

FROM judge0/judge0:1.13.1@sha256:6b5d6a66aa19a8e878a52ea3c6a560afc1086734d96e2885b561fd5c6018f082
USER root
COPY --from=python311 /usr/local/code-garden/python-3.11 /usr/local/code-garden/python-3.11
COPY --from=python312 /usr/local/code-garden/python-3.12 /usr/local/code-garden/python-3.12
COPY --from=python313 /usr/local/code-garden/python-3.13 /usr/local/code-garden/python-3.13
COPY --from=python314 /usr/local/code-garden/python-3.14 /usr/local/code-garden/python-3.14
COPY versions.json register-languages.rb healthcheck.rb setup-cgroups.sh entrypoint.sh /api/code-garden/
COPY seeds.rb /api/db/seeds.rb
COPY --from=isolate2 /code-garden-isolate/isolate-v2 /usr/local/bin/isolate-v2
COPY isolate-v2.conf /usr/local/etc/isolate-v2/isolate
RUN mv /usr/local/bin/isolate /usr/local/bin/isolate-v1
COPY isolate-compat.sh /usr/local/bin/isolate
RUN chmod 755 /usr/local/bin/isolate /api/code-garden/entrypoint.sh && \
    chmod 4755 /usr/local/bin/isolate-v2 && \
    for series in 3.11 3.12 3.13 3.14; do \
      ln -s /usr/local/code-garden/python-${series}/bin/python${series} /usr/local/bin/python${series}; \
    done
USER judge0
ENTRYPOINT ["/api/code-garden/entrypoint.sh"]
# Setting ENTRYPOINT resets an inherited CMD, so repeat the upstream server CMD.
CMD ["/api/scripts/server"]
# Compose overrides CMD for worker.
