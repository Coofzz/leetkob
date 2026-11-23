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

## Deployment

One Ubuntu VM with Docker: Caddy for HTTPS, the API and the worker as systemd services, each under its
own user. Step by step, with the checks to run afterwards: [`docs/deploy.md`](docs/deploy.md).

## Model and spending cap

The constraint review (PA#3) calls Google Gemini `gemini-3.6-flash` through the Gemini API (set by
`LLM_MODEL`; `gemini-2.5-flash`, named in PA#2, is no longer served to new keys).
The API key lives only in `.env` (git-ignored) and in no other place. Spending cap: **0 USD per month** —
the key belongs to a Google AI Studio project with no billing account, so it can only use the free tier
and can never be charged. Before PA#3 we will decide whether to enable billing; if we do, a monthly budget
cap of 5 USD will be set in Google Cloud Billing first.
On 2026-11-23 the team decided to stay on the free tier.

**Cost of one lab of 80 submissions**, measured on the committed dev-set run
([`runs/dev-2026-11-23/`](runs/dev-2026-11-23/README.md)): one model call per counted submission, only for
the constraints the hard rules leave; on average 852.9 input and 657.7 output tokens per call (output
includes thinking). At the paid price of `gemini-3.6-flash` until 2026-12-31 (0.75 USD per million input
tokens, 3.75 per million output tokens):

- one call: (852.9 × 0.75 + 657.7 × 3.75) / 1 000 000 = 0.0031 USD
- one lab: 80 × 0.0031 = **0.25 USD** (0.50 USD at the 2027 price, 1.50 / 7.50)

On the free tier it costs 0 USD, but Google allows **20 generate requests per day per project** for this
model: one lab of 80 takes four days of quota, and calls beyond it come back `429` and leave the semantic
constraints `unsure` in the TA's queue (never a verdict). A class in real use needs billing, with the
budget cap above.
