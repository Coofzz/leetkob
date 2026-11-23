# The checker image: runs the checker command on a dataset folder mounted read-only.
#   docker build -f docker/checker.Dockerfile -t leetkob-checker .
#   docker run --rm --network none -e MODEL_OFF=1 -v "$PWD/leetkob-eval:/data:ro" leetkob-checker \
#     --data /data > predictions.jsonl
# Only package*.json, tsconfig.json and src/ are copied (see .dockerignore): no .env, no data, no .git.
FROM node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
USER node
ENTRYPOINT ["/app/node_modules/.bin/tsx", "src/checker/cli.ts"]
