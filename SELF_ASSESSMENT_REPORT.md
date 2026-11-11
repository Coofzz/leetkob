# Self-assessment — PA#2

Submitted by: 23120017 — Trần Thanh An · 23120096 — Nguyễn Viết Toàn · 23120154 — Nguyễn Thanh Phong

Total we claim: 95 / 100

| Criterion | Max | We claim | Evidence |
|---|---|---|---|
| Rules file | 15 | 14 | `CLAUDE.md` — stack, commands, conventions, never, permissions; the never list is about LeeTKOB (tests / eval data / labels, real model in tests, sandbox secrets, student IDs to the model). Two lines with a story: the global body parser (PR #3, commit `160cfb9`) and the pipe that hid a test result (`AI-LOG.md`, 2026-11-11). Drafted with the assistant, rewritten by us (PR #1) |
| Permissions and secrets | 10 | 10 | `.claude/settings.json` allow / ask / deny, with reasons in `CLAUDE.md`; `.env.example` without values; `.env` in `.gitignore`; a search of the whole history (`git log -p --all`) finds no key; README "Model and spending cap": Gemini free tier, no billing account, cap 0 USD |
| One command for every check | 10 | 9 | README "Checks"; `.github/workflows/ci.yml` runs the same five npm scripts, one job each; a fresh clone following the README is green |
| CI that blocks a merge | 20 | 20 | Ruleset on `main`, five checks required, empty bypass list (`docs/pa2/protection-*.png`); PR #3 blocked by the red `contract` job on `98da8d5`, turned green by `160cfb9`; a direct push was rejected (GH013) and every commit after `1c9cf04` reached `main` through a PR |
| The contract of one LeeTKOB endpoint | 25 | 24 | `docs/contract/post-lab-submissions.md` — role and ownership (§3, 404 for another class, TA, admin), request and response with field rules (§4), every error type with its status (§2), order of checks, idempotency (§5), change policy (§7) |
| Contract tests that bite | 15 | 14 | `test/contract/submissions.test.ts`, 23 tests run by the required `contract` job: each error type, ownership, idempotency incl. 409 in flight. Deliberate break: PR #4, CI red on four §3 tests |
| AI-LOG.md | 5 | 4 | `AI-LOG.md` — tool per part; Changed / Rejected: the rewritten rules file, the global body parser, the pipe that could not fail, the PR opened too late |

## What we did not manage

- The whole checkpoint was done by one member (Nguyễn Viết Toàn); the other two worked on other assignments.
- We did not cite a product owners' FAQ entry; the 404 / no-late / 64 KiB decisions are our own.
- There is no login endpoint yet: tokens are seeded. The 409 in-flight test depends on timing.
- The first attempt at the blocked PR failed because the branch was pushed before the PR was opened (AI-LOG).

## What we would do differently

Open the pull request right after the first push, so CI runs on every commit; write the rules file's
story lines only once the incident has a link.
