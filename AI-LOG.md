# AI-LOG.md — LeeTKOB

One log for every milestone, oldest first: PA#2 below, then PA#3.

# PA#2 — Harness and quality gate

Team: Trần Thanh An (23120017) · Nguyễn Viết Toàn (23120096) · Nguyễn Thanh Phong (23120154).
All of PA#2 was done by Nguyễn Viết Toàn; the other two members worked on other assignments this week.

Assistant: Claude (Claude app, Claude Opus 5.5) for everything below.
Product model (PA#3 constraint review): Google Gemini `gemini-2.5-flash`, free tier. The key is in a Google
AI Studio project with no billing account, so its spending cap is 0 USD; it was created by hand and lives
only in `.env`. Cost of one lab: to be measured in PA#3.
No secret or real user data was given to the assistant; the API key was never pasted into a prompt.

## 2026-11-11 — repository skeleton and CI
Asked for: a TypeScript skeleton with one npm script per check (lint, format check, type check, unit tests,
contract tests), a CI workflow with one job per check, `.env.example`, and three permission tiers.
Kept: the five scripts, `ci.yml` with one job per check (so each can be required), `.env.example`,
`.claude/settings.json`.
Found while building: the assistant checked the tests with `npm test | grep "pass"`. The default reporter
printed TAP, grep found nothing, and the pipe's exit code was grep's, not the tests'. Nothing showed
whether the tests had failed. That is the same mistake as a CI step that can never fail, so CI runs each
script bare, the scripts use `--test-reporter=spec`, and it became a "Never" line in CLAUDE.md.
By hand: created the repository, pushed the skeleton, turned on the `main` ruleset (empty bypass list, the
five checks required), tried a direct push to `main` and saw it rejected, created the API key.

## 2026-11-11 — rules file (PR #1)
The assistant gave a draft `CLAUDE.md` and a reference list (rubric, session 3 notes, brief, repo facts).
Changed (by me): rewrote the file in my own words — the opening line about wrong deductions; "report the
real output, not 'should pass'"; "never invent a problem type"; reply in Vietnamese, code in English; tests
and code in separate commits; LeeTKOB-specific Never lines (no student name or ID to the model, the model
never decides a deduction, no marks published before the TA's review); a reason for each permission tier.
Rejected: the draft's Permissions list without reasons.
Fixed: my first commit of `CLAUDE.md` already had the two story lines, citing PR #3 before PR #3 existed. I
moved them out (commit `8008fa2`) and added them back only after PR #3 was merged, with its real links.

## 2026-11-11 — contract of POST /labs/{labId}/submissions (PR #2)
Asked for: a contract in the structure of IA#3's CONTRACT.md for the endpoint a student submits to.
Kept: the error table, the order of checks, idempotency scoped to one student.
Decided (by me, after reading §3–§5): a student of another class, a TA and an admin get 404, not 403, so the
response does not reveal that the lab exists; no late submissions (422 deadline-passed); code up to 64 KiB.

## 2026-11-11 — contract tests, then the implementation (PR #3)
Asked for: tests written from the contract only, one per rule, named after its section; then the
implementation, in a separate commit, without touching the tests.
Kept: 23 tests in `test/contract/submissions.test.ts` (each error type, ownership for another class / TA /
admin, idempotency: replay, key order, different body, extra field, per-student keys, only-201-stored,
409 in flight), and `src/submissions.ts`.
Rejected: the global `app.use(express.json())` the assistant had put in `src/app.ts`. It parsed every body
before any route ran, so a student of another class who sent malformed JSON got `400 invalid-json` instead
of `404` — leaking that the lab exists (contract §3). The test "§4 ownership is checked before the body"
was red in PR #3; commit `160cfb9` removed the parser and the route now reads its body after the ownership
check. It is a "Never" line in CLAUDE.md.
Went wrong (my mistake): I pushed both commits to the branch before opening the PR. CI runs on
`pull_request`, so it never ran on the tests-only commit and the PR would have been green at once. I pushed
the first commit alone to a new branch (`submissions-tests`), opened PR #3 there (red, merge blocked), then
pushed the implementation (green). No commit was rewritten and nothing was force-pushed.
Went wrong (my mistake): I clicked Merge on PR #3 but not Confirm. Before deleting the old branch I checked
`git merge-base --is-ancestor origin/submissions origin/main`; it said no, so I merged first, then deleted.
By hand: the deliberate contract break in PR #4: one line in the ownership query; CI went red on four §3
tests (other class, TA, admin, ownership before the body) and the PR was closed unmerged.

## 2026-11-11 — PA2.md, this log, self-assessment
The assistant drafted these three files from the links and notes I sent. By hand: checked every link and
decided the marks.

# PA#3 — Prototype with the LLM feature running

PA#3 is done by Trần Thanh An alone, as the team agreed on 2026-11-23. An opens and merges each pull request
after CI is green. "I" below is An.

Assistant: Claude Code (VS Code extension, Claude Opus 5.5) for the entries below.
No secret or real user data was given to the assistant. It never read `.env`; the API key was never pasted
into a prompt.

Product model: Google Gemini `gemini-2.5-flash`, free tier, spending cap 0 USD (no billing account). The team
decided on 2026-11-23 to stay on the free tier rather than enable billing.
What leaves our system when the constraint review runs: the lab statement, the semantic constraints (id and
text, never the deduction) and the student's code with every comment removed. No name, student ID, email or
account id is sent. On the free tier, Google's terms let it use what we send to improve its products. We
accept that because the statement and constraints are written by the TA for the class, and the code is an
anonymous lab exercise with its comments stripped. If a class needs more than that, the fix is to enable
billing; the cost estimate in the README prices it.

## 2026-11-20 to 2026-11-23 — importing the dev set, with an integrity check (PR #6)
Tool: Claude Code.
Asked for: put the published dev set (`fithcmus/awad-leetkob-eval` at `552c811`) into the repository
unchanged, and make it hard for anyone on the team to change it by accident.
Found: the copy on my Windows machine did not match the published hashes. Git for Windows sets
`core.autocrlf=true`, which turned LF into CRLF on checkout and also inside `git archive`. The assistant
traced it by comparing the hashes of `eval.mjs` and `labels.jsonl` with the published ones.
Kept: `.gitattributes` (`leetkob-eval/** -text`), the manifest `leetkob-eval.sha256`,
`scripts/verify-devset.mjs`, a pre-commit hook, and a CI job `devset` that runs on Ubuntu and Windows.
Changed: the script printed with `console.log`, which our `no-console` rule rejects; it now writes to stdout.
`leetkob-eval/` went into `.prettierignore` and the ESLint ignores: `npm run format` runs on `.` and would
have rewritten the dev set.
Rejected: the assistant first created a new, separate repository for PA#3 before I pointed it to this one;
I deleted that repository and the work came here as PR #6. It also showed me pages 14–16 of the session 6
PDF as the sandbox slides; the rubric means the slides numbered §14–16 in the footer, PDF pages 18–20.

## 2026-11-23 — architecture decisions, module boundaries (PR #7)
Tool: Claude Code.
Asked for: `docs/decisions/pa3-architecture.md` from my plan's table of decisions (context, choice, rejected
options, risks); the PA#3 Never lines in `CLAUDE.md`; `src/types.ts` and fakes, so that the sandbox, the
checker and the worker can be built and tested apart.
Kept: the 16 decisions, `JudgeFn` and `ReviewFn`, `fakeJudge` and `fakeReview` with three unit tests.
Changed: my plan disagreed with the product owner's FAQ in four places; checking the draft against the FAQ
caught them, and the ADR follows the FAQ. Output over 1 MB is `RE` for the student (FAQ-05), not a new
verdict. The worker reviews every Accepted submission that is still the student's latest, instead of
waiting for the deadline (FAQ-02 allows early review; otherwise the queue would be empty when the flow is
tried). FAQ-09's "cost cap" reason for `unsure` is left for PA#4: with a 0 USD free tier there is no per-lab
budget yet. FAQ-01 wants students to join by an invite code or be added by a TA; a bootstrap script stands
in for now and is listed as a risk.
Checks: lint, format, typecheck, 5/5 unit tests, 24/24 contract tests, `verify-devset` OK, CI green.
By hand: the team decisions above; merging PR #6 and PR #7.

## 2026-11-23 — judging sandbox with nine attack tests (PR #9)
Tool: Claude Code.
Asked for: the nine attack submissions and their tests first (CI red), then the judge image and the
runner, then a CI job that runs the attacks with the real image.
Kept: `docker/judge.Dockerfile` (g++ and one script, uid 65534, base pinned by digest, build context
`docker/` only), `src/sandbox/runner.ts` (a compile container and a run container, every flag of slide §16,
code and tests on stdin as a tar, the docker CLI spawned with `PATH` only, `docker rm -f` when a
container's wall-clock budget runs out), the CI job `sandbox`.
Changed: three attacks were weaker than they looked, found when the first run had two failures and one
suspiciously fast pass. Attack 3 finished in 3.5 s because `timeout` kills the whole process group, so it
never needed the container kill; its child now calls `setsid()`, and the test checks the job outlived the
3 s test limit (it now takes about 9 s and is stopped by the container budget). Attack 8 did not compile
(missing `<initializer_list>`), so it tested nothing. Attack 9 at compile time included `/proc/1/environ`,
which reads as empty because the kernel reports its size as 0, so it could never leak; it now probes real
secret-file paths, including our deployment's `/etc/leetkob/env`. These went in a separate test commit
before the code.
Checked that the tests can fail: with one protection removed at a time, the same attacks printed
CONNECTED (no `--network none`), the 1 GiB sum (no `--memory`), UNLIMITED (no `--pids-limit`), ROOT
(`--user 0`), SOCKET (Docker socket mounted) and LEAK (`-e LLM_API_KEY=...`).
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45121373922 · green run:
https://github.com/Coofzz/leetkob/actions/runs/45121938292
