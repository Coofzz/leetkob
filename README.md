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

## Model and spending cap

The constraint review (PA#3) calls Google Gemini `gemini-2.5-flash` through the Gemini API.
The API key lives only in `.env` (git-ignored) and in no other place. Spending cap: **0 USD per month** —
the key belongs to a Google AI Studio project with no billing account, so it can only use the free tier
and can never be charged. Before PA#3 we will decide whether to enable billing; if we do, a monthly budget
cap of 5 USD will be set in Google Cloud Billing first.
Expected cost of one lab (80 submissions): to be measured in PA#3.
