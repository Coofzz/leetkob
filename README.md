# LeeTKOB

Constraint review for C++ lab submissions — the CSC13114 (AWAD) class project, HK1 2026–2027.
Brief: the class project brief on Classroom. Endpoint contract: [`docs/contract/`](docs/contract/).

## Requirements

- Node.js 22.13 or later (`node:sqlite`). The version CI uses is in `.nvmrc`.
- macOS, Linux or WSL 2.

## Setup

```bash
git clone https://github.com/Coofzz/leetkob.git
cd leetkob
npm ci
cp .env.example .env      # fill in values; .env is never committed
npm start                 # http://localhost:3000/health
```

## Checks — the same commands run locally and in CI

| Check | Command |
|---|---|
| Lint | `npm run lint` |
| Format check | `npm run format:check` (fix with `npm run format`) |
| Type check | `npm run typecheck` |
| Unit tests | `npm test` |
| Contract tests | `npm run test:contract` |

`.github/workflows/ci.yml` runs each of these as its own job on every pull request. `main` is
protected: all five jobs are required, and nothing is pushed to `main` directly.

## Checker — constraint review on a dataset folder

One command takes a folder laid out like `leetkob-eval/` and writes one prediction line per
(solution, constraint), the format `leetkob-eval/README.md` describes. It reads `statement.md` and
`constraints.json` only — never `labels.jsonl` — so it runs the same way on any dataset.

```bash
MODEL_OFF=1 npm run checker -- --data leetkob-eval --out predictions.jsonl
node leetkob-eval/eval.mjs --data leetkob-eval --predictions predictions.jsonl
```

`MODEL_OFF=1` runs the hard rules only: every ban-list constraint is decided, every semantic constraint
is `unsure`, and no network connection is opened. Without `--out` the predictions go to stdout.

Without `MODEL_OFF=1` the semantic constraints go to the model (`LLM_API_KEY`, `LLM_MODEL`,
`LLM_TIMEOUT_MS`, `LLM_MIN_INTERVAL_MS` from the environment; `node --env-file=.env` loads `.env`).
The answer must pass a schema check and arrive before the timeout, or the constraint is `unsure` with
the reason (`schema`, `timeout`, `evidence-mismatch`, `model-error`, `model-unsure`). `--calls <file>`
appends one line per model call: the provider's request id, model, tokens, time, cost and the prompt.

```bash
node --env-file=.env --import tsx src/checker/cli.ts --data leetkob-eval \
  --out predictions.jsonl --calls calls.jsonl
```

The same command as an image, with no network:

```bash
npm run checker:build          # docker build -f docker/checker.Dockerfile -t leetkob-checker .
docker run --rm --network none -e MODEL_OFF=1 -v "$PWD/leetkob-eval:/data:ro" leetkob-checker \
  --data /data > predictions.jsonl
```

## Judging sandbox

`npm run sandbox:build` builds the judging image; `npm run test:sandbox` runs one attack submission per
sandbox minimum against it (needs Docker). CI runs both in the `sandbox` job.

## Model and spending cap

The constraint review (PA#3) calls Google Gemini `gemini-2.5-flash` through the Gemini API.
The API key lives only in `.env` (git-ignored) and in no other place. Spending cap: **0 USD per month** —
the key belongs to a Google AI Studio project with no billing account, so it can only use the free tier
and can never be charged. Before PA#3 we will decide whether to enable billing; if we do, a monthly budget
cap of 5 USD will be set in Google Cloud Billing first.
Expected cost of one lab (80 submissions): to be measured in PA#3.
