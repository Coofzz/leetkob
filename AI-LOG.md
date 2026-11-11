# AI-LOG.md — PA#2 Harness and quality gate

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
