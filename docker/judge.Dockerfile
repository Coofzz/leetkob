# The judging image: g++ and one run script, nothing else — no app source, no .env, no node_modules.
# Built with `npm run sandbox:build`, whose context is docker/ only. Base pinned by digest.
FROM gcc:14-bookworm@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15
COPY judge-run.sh /usr/local/bin/judge-run
RUN chmod 555 /usr/local/bin/judge-run
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/judge-run"]
