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

## 2026-11-23 — hard rules for ban-list constraints (PR #10)
Tool: Claude Code.
Asked for: tests first, from snippets written for the test file only (no dev-set code), covering obvious
uses, disguised ones and traps; then a lexer and a name resolver that make them pass without editing them.
Kept: 27 tests in `test/unit/hard-rules.test.ts`; `src/checker/lexer.ts` and `src/checker/hard-rules.ts`.
Banned names are read from the backticks of the constraint text; nothing names a problem or a file.
Changed: the first version failed `npm run typecheck` (`noUncheckedIndexedAccess` on the exponent case of
the number lexer) although every test passed; running all five checks, not only the tests, caught it.
Decided (by me): an unqualified call to a std name that the student did not declare counts as a use even
without `using namespace std`, because the code compiles, so the call must reach the library (argument-
dependent lookup). The student's own function or variable with a banned name is never a use, even with
`using namespace std`; a using-declaration that is never called is not a use either. Both lean towards pass.
Known gaps: a name built by token pasting (`##`) in a macro, a banned name reached through a template
parameter or a function pointer passed in from elsewhere, and a declaration the resolver does not recognise
(it then treats a call as the student's own and says pass).
Dev set with the model off (throw-away script, until the checker command exists): 0 wrongful deductions; all
55 ban-list pairs decided, none `unsure`; all 15 ban-list violations caught with a labelled line. The
other 22 misses and the 47 `unsure` are the semantic constraints, which the model decides.
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45123450482

## 2026-11-23 — checker command, MODEL_OFF and the checker image (PR #11)
Tool: Claude Code.
Asked for: tests first for one command that turns a dataset folder into the prediction file, with
`MODEL_OFF=1` running the hard rules only and opening no connection; then the command, the `ReviewFn` the
worker will call, and an image that runs offline.
Kept: `src/checker/cli.ts`, `src/checker/review.ts`, `docker/checker.Dockerfile`, a `.dockerignore` that
lets only `package*.json`, `tsconfig.json` and `src/` into the build, and a README section.
How the tests can fail: the fixture's `labels.jsonl` is a directory, so reading it throws; with
`MODEL_OFF=1` the test replaces `fetch` and `net.Socket.prototype.connect` with functions that throw; on the
dev set the test fails if `eval.mjs` exits with 2 or finds a wrongful deduction.
Changed: the first Dockerfile set an environment variable for tsx's cache that I could not find in tsx's
documentation; I removed it and checked that the image runs as `node` with `--network none`.
Decided (by me): without `--out` the predictions go to stdout, so a marker can redirect them and does not
need a writable mount for the container's user. Until the model client exists the command refuses to run
without `MODEL_OFF=1` (exit 2) instead of writing `unsure` everywhere and looking like a real run.
Checked: `docker run --rm --network none --memory 512m --pids-limit 64 -e MODEL_OFF=1` on the dev set gives
the same file as the local run; `eval.mjs` exits with 1 (thresholds not met yet), never 2; 0 wrongful.
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45128404529

## 2026-11-23 — the model call: de-identification, prompt, Gemini client, call log (PR #12)
Tool: Claude Code.
Asked for: tests first, with a fake fetch and no network, for what leaves the system (comments and any
name in them removed, literals and line numbers kept), the prompt (statement, semantic constraints, numbered
code, nothing about deductions), the Gemini client (key in a header only, a timeout, no key in any error)
and the call log; then the code. Not wired into the review yet: the model's output must not reach anything
before its schema check and timeout exist (next PR).
Kept: `src/checker/deidentify.ts`, `prompt.ts`, `gemini.ts`, `call-log.ts`, and `scripts/model-smoke.ts`
for one real call with a self-written snippet.
Changed: (1) the client first used `AbortSignal.timeout`; five tests were cancelled with "Promise resolution
is still pending but the event loop has already resolved", because that timer does not keep the process
alive. It now uses its own timer and clears it. (2) ESLint's `preserve-caught-error` wanted the network
error attached as `cause`; I kept it out on purpose, because `console.error` prints the cause chain, and
the line says why.
Checked against the provider's documentation (read 2026-11-23 through a fetch agent): `responseId`,
`modelVersion` and the `usageMetadata` token counts exist; paid price 0.30 USD per million input tokens
and 2.50 per million output tokens, thinking included; the free tier's content may be used to improve
Google's products. Not confirmed word for word: the request field names for the JSON schema, so our own
validator stays the check. The pricing page also says `gemini-2.5-flash` is deprecated and its requests go
to another model from 2026-12-01; the model now comes from `LLM_MODEL`.
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45131180859

## 2026-11-23 — schema check and timeout on the model, wired into the review (PR #13)
Tool: Claude Code.
Asked for: tests first, with a fake model, for every way the answer can be wrong (not JSON, no verdicts,
an unknown verdict, a deduction or score field, missing or repeated constraints, wrong types, evidence that
does not match the code) and for a model slower than the timeout; then a hand-written validator and the
wiring, so that nothing the model says reaches a verdict without passing both.
Kept: `src/checker/validate.ts`, `src/checker/semantic.ts`; the checker now calls the model without
`MODEL_OFF=1` and writes the call log with `--calls`.
Decided (by me): each constraint is checked on its own, so one broken entry does not spoil the others; an
unknown constraint id is ignored but a missing or repeated one is `unsure`. Evidence is accepted when it
matches the line the model was shown (comments blanked) and is reported as the original line, because
`eval.mjs` compares with the original. The review has its own timeout on top of the client's, so a client
that ignores its abort signal still cannot hold a submission. I added `model-unsure` to the unsure reasons
and kept the model's one-sentence reason, because FAQ-09 asks that the TA see why a verdict is unsure.
Changed: nothing the assistant wrote failed a check this time; the 13 new tests passed on the first run of
the code, and the five checks were green.
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45132498091

## 2026-11-23 — sign-in, a TA creates a lab, the accounts script (PR #14)
Tool: Claude Code.
Asked for: the two contracts first (`post-auth-login.md`, `post-class-labs.md`), then contract tests written
from them, then migration 003, the two endpoints and a script for the admin to create accounts.
Kept: both contracts; 17 contract tests; `migrations/003_accounts_labs.*`, `src/passwords.ts`, `src/auth.ts`,
`src/labs.ts`, `scripts/accounts.ts` and `docs/accounts.example.json`.
How the tests got in: `.claude/settings.json` denies the assistant any edit under `test/contract/`, the rule
from PA#2 that stops it weakening a contract test. The assistant wrote the two new files in its scratch
folder; I read them and copied them in myself, then ran Prettier on them (only formatting changed: trailing
commas). The PA#2 contract tests were not touched. My first copy failed because I pasted Bash syntax into
PowerShell; nothing was copied until the PowerShell version.
Decided (by me): a student of the class gets the same 404 as a stranger when creating a lab (a student has
no reason to learn which classes have which TAs); each sign-in issues a new token and ends the earlier one;
the accounts script never creates a lab, because the rubric deducts when a lab needs a seed script.
Checked: 41 contract tests (24 from PA#2, 17 new), 61 unit tests, lint, format, typecheck; the down
migration of 003 restores the PA#2 columns and tables exactly; `npm run accounts` run twice on the same
database gives the same accounts and memberships.
Red run (contracts and tests only): https://github.com/Coofzz/leetkob/actions/runs/45136020905

## 2026-11-23 — job queue and a separate worker (PR #15)
Tool: Claude Code.
Asked for: tests first, with a fake judge and a fake review, for the rubric's check (stop the worker, submit,
start it, judged exactly once), a worker dying half-way, two workers at once, a job that keeps failing, and
FAQ-02 (review only the latest Accepted submission); then migration 004, the queue and the worker.
Kept: `migrations/004_jobs_results.*`, `src/queue.ts`, `src/worker.ts`, the job inserted in the same
transaction as the submission, `busy_timeout` and WAL in `db.ts` because two processes share the file.
Changed: one test of mine failed although the values were right: `node:sqlite` returns rows with a null
prototype, so `deepStrictEqual` rejected `{status: 'queued', attempts: 0}`. I fixed the comparison in its
own test commit; it checks the same two values.
Decided (by me): "exactly once" means one set of results in the database, enforced by primary keys and
`ON CONFLICT DO NOTHING`, and a retried job reuses the stored judge result instead of judging again; the
lease is 2 minutes and a job gives up after 3 attempts (the submission shows `system_error`).
Checked by hand, with the real sandbox: API and worker as two processes on one database file; with the
worker stopped a student's submission stayed `queued` with no result; the worker started later judged it
(both tests AC), the hard rule decided C1 and C2 was `unsure` (`model-off`), attempts 1, no container left;
a second worker started afterwards judged nothing again. Stopping the worker with `kill -INT` from Git Bash
did not reach the node process on Windows; Ctrl+C in a terminal does.
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45137367873

## 2026-11-23 — reading a submission (PR #16)
Tool: Claude Code.
Asked for: the contract `get-submission.md` first, contract tests from it, then the endpoint: the student
sees the judge's verdicts but never the tests (FAQ-02) and never a constraint verdict (FAQ-08); a TA of the
class also sees the review with the deduction they set.
Kept: the contract, 10 contract tests, `src/submissions-read.ts`.
How the tests got in: as in PR #14, the assistant wrote the test file outside the repository and I copied it
into `test/contract/` myself; this time it was already formatted with our Prettier settings.
How the tests can fail: a secret string is put in a test's input and expected output, and the tests assert
it never appears in the response; another asserts the word `violation` and the evidence line never reach
the student, while the same submission read by the TA has them.
Decided (by me): a student sees their own code; output over the limit is shown as `runtime_error` for
everyone (FAQ-05), while the database keeps `output_limit` for the logs.
Red run (contract and tests only): https://github.com/Coofzz/leetkob/actions/runs/45139468812

## 2026-11-23 — the TA's review queue (PR #17)
Tool: Claude Code.
Asked for: the contract `get-lab-review-queue.md` first, contract tests from it (copied in by me, as before),
then the endpoint: only counted submissions (FAQ-02), every violation and unsure, ceil(10%) of the passes
at random (FAQ-10), the TA's deduction and the unsure reason (FAQ-09), and no publish endpoint.
Kept: the contract, 10 contract tests, `src/review-queue.ts`, migration 005 (`sample_rank`).
Changed: the first version gave each verdict its random rank with `abs(random())`; six tests answered 500
with `RangeError: Value is too large to be represented as a JavaScript number`, because SQLite's random
integers go up to 2^63 and `node:sqlite` will not read past 2^53 as a number. The rank is now below 10^9.
Decided (by me): a student of the class gets 403 (they know the lab exists), anyone outside the class 404,
as in the ADR; the sample is random but stored, so a TA who reloads the page sees the same sample.
Red run (contract and tests only): https://github.com/Coofzz/leetkob/actions/runs/45142136900

## 2026-11-23 — screens, and the lab read endpoints they need (PR #18)
Tool: Claude Code.
Asked for: minimal screens for the whole flow in plain HTML and JS (no framework, no build step), and the
endpoints they need to list labs and show one lab with its constraints and deductions (FAQ-06); the
contract and its tests first, copied in by me as before.
Kept: `docs/contract/get-labs.md`, 7 contract tests, `src/labs-read.ts`, `public/` (sign in, student, TA),
a CSP that allows only our own scripts and styles, and UI tests that fail if any page script uses
`innerHTML`, `eval` or similar, or if a page has an inline script or handler.
Changed: two slips caught by the checks before the commit: ESLint flagged a variable initialised and never
read; and a regex the assistant wrote through a shell lost its backslash (`/\s+/` became `/s+/`), so the
"FAQ-06 notice" test failed. Prettier had wrapped "hard rules" over two lines, so the test now reads the page
with whitespace collapsed, as a browser does.
Not checked by a test: what the screens do in a browser. Still to do by hand before the tag: sign in as a TA,
create a lab, sign in as a student, submit, watch the result, open the review queue.
Red run (contract and tests only): https://github.com/Coofzz/leetkob/actions/runs/45143665015

## 2026-11-23 — own cases, and a hard-rule bug they found (PR #19)
Tool: Claude Code.
Asked for: tests first (layout, labels, at least one trap and one injection, every solution Accepted by our
own judge, no wrongful deduction with the model off), then a problem that is not in the dev set
(`max-subarray`) with six solutions written for it, labelled with evidence lines.
Kept: `own-cases/` (statement, constraints, 4 tests, s01–s06, `labels.jsonl`, README), the unit test and a
sandbox test that judges every solution in CI.
Found: with the model off, s03 (a macro around `*max_element(...)` and `using namespace std`) was scored
`pass` for C1. The resolver read `* name (` as a declaration such as `int *f(`, so it took `max_element`
for the student's own function. A wrongful pass, not a wrongful deduction, but exactly the "disguised" case
the rule exists for, and nothing in the dev set had shown it. I had a self-written test reproduce it first
(plus a trap: a student's own pointer-returning `max_element` stays a pass), then the rule was fixed: a `*`
or `&` counts as part of a declaration only after a type.
Checked: own cases with the model off: 0 wrongful, both C1 violations caught (the two C2 violations are for
the model); dev set unchanged: 0 wrongful, 15/15 ban-list violations caught.
Also: a single shell command that edited the file was refused by Claude Code's safety check because it
could not parse the quoting; the same change went in through the editor instead.
Red run (tests only): https://github.com/Coofzz/leetkob/actions/runs/45146278181
