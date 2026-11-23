# Dev-set run, 2026-11-23 (real model)

The checker on the published dev set with the real model, committed as it came out. Re-score it with:

```bash
node leetkob-eval/eval.mjs --data leetkob-eval --predictions runs/dev-2026-11-23/predictions.jsonl
```

| File | What |
|---|---|
| `predictions.jsonl` | the checker's output, 102 lines (47 solutions × their constraints) |
| `report.txt`, `summary.json` | `eval.mjs` on it (`--json summary.json`) |
| `calls.jsonl` | one line per model call: provider request id (`requestId`), model, tokens, time, cost at the paid price, outcome, the prompt sent, and the constraints a hard rule decided (`skippedByHardRules`) |
| `started-at.txt`, `finished-at.txt` | UTC, 09:54:51 → 10:05:48 |

Command (key and model from the environment, never in a file here):

```bash
LLM_MODEL=gemini-3.6-flash LLM_MIN_INTERVAL_MS=6000 LLM_TIMEOUT_MS=90000 \
  node --env-file=.env --import tsx src/checker/cli.ts --data leetkob-eval \
  --out runs/dev-2026-11-23/predictions.jsonl --calls runs/dev-2026-11-23/calls.jsonl
```

## Result

| Metric | This run | Threshold (from PA#4) |
|---|---|---|
| Wrongful deductions | **0** | = 0 |
| Recall | **64.9%** (24/37) | ≥ 90% |
| Unsure rate | **21.6%** (22/102) | ≤ 20% |

## What happened to the 39 model calls

8 solutions (`reverse-recursive`, both constraints are ban lists) needed no call: the hard rules decided
everything. The other 39 solutions got one call each, for their semantic constraint only:

| Outcome | Calls | Effect |
|---|---|---|
| answered (`ok`), request id present | 18 | verdicts checked against the schema and the code |
| `429` — free-tier quota | 19 | `unsure` (`model-error`) |
| `503` — provider overloaded | 1 | `unsure` (`model-error`) |
| timeout after 90 s | 1 | `unsure` (`timeout`) |

The free tier of `gemini-3.6-flash` allows **20 generate requests per day per project** (Google's 429:
"Generate content requests per day limit exceeded on Free Tier … limit: 20"). The run hit it after its 20th
request. Every refused call became `unsure`, never a verdict, so the 0 wrongful deductions hold; most of the
13 missed violations and most of the `unsure` pairs are those 21 calls. We kept this run as it came out: the
team stays on the free tier (0 USD), and a full run needs 39 calls, more than one day's quota.

## Cost

From the 18 answered calls: 15 352 input and 11 839 output tokens, on average **852.9 input and 657.7 output
tokens per call** (output includes thinking). At the paid price of `gemini-3.6-flash` until 2026-12-31
(0.75 USD per million input tokens, 3.75 per million output tokens):

- one call: (852.9 × 0.75 + 657.7 × 3.75) / 1 000 000 = **0.0031 USD**
- one lab of 80 submissions, one call per counted submission: 80 × 0.0031 = **0.25 USD**
  (0.50 USD at the price from 2027-01-01: 1.50 / 7.50)
- on the free tier: **0 USD**, but at most 20 reviews per day per project, so one lab of 80 takes four days
  of quota; beyond it the semantic constraints wait in the TA's queue as `unsure`.
