# PA#2 — Harness and quality gate · LeeTKOB

Team: Trần Thanh An (23120017) · Nguyễn Viết Toàn (23120096) · Nguyễn Thanh Phong (23120154)

| What | Link |
|---|---|
| Repository (public) | https://github.com/Coofzz/leetkob |
| Protected `main` — ruleset `protect-main` | [protection-1](docs/pa2/protection-1.png) · [protection-2](docs/pa2/protection-2.png) · [protection-3](docs/pa2/protection-3.png) · https://github.com/Coofzz/leetkob/rules |
| Pull request a red check stopped | https://github.com/Coofzz/leetkob/pull/3 — first commit [`98da8d5`](https://github.com/Coofzz/leetkob/commit/98da8d5) has the contract tests only: job `contract` red, merge blocked |
| The commit that turned it green | https://github.com/Coofzz/leetkob/commit/160cfb9 — the implementation, in its own commit; tests untouched |
| Deliberate contract break caught by CI | https://github.com/Coofzz/leetkob/pull/4 — one line drops the ownership check; four §3 tests red; closed unmerged |
| CI run for the `pa2` tag | https://github.com/Coofzz/leetkob/actions?query=branch%3Apa2 |

## Where each part lives

- Rules file: [`CLAUDE.md`](CLAUDE.md) · permissions: [`.claude/settings.json`](.claude/settings.json)
- Variables: [`.env.example`](.env.example) · model and spending cap: [README](README.md#model-and-spending-cap)
- Checks: README "Checks" · CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Contract: [`docs/contract/post-lab-submissions.md`](docs/contract/post-lab-submissions.md)
- Contract tests: [`test/contract/submissions.test.ts`](test/contract/submissions.test.ts)
- AI use: [`AI-LOG.md`](AI-LOG.md) · self-assessment: [`SELF_ASSESSMENT_REPORT.md`](SELF_ASSESSMENT_REPORT.md)

The only direct push to `main` is the skeleton (`1c9cf04`), before the ruleset existed. After the ruleset
was turned on, a test push straight to `main` was rejected (`GH013: Repository rule violations`), and every
change since reached `main` through a pull request (#1 – #3, and the PR that adds this file) with all five
checks green.
