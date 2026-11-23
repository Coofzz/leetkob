# ADR — PA#3 architecture

Status: accepted, 2026-11-23 · Author: Tran Thanh An · Scope: PA#3 (prototype with the LLM feature running)

PA#3 turns the PA#2 skeleton into a working product: a TA creates a lab, a student submits, a separate
worker judges the submission in a sandbox, hard rules and then a model review the constraints, and the
verdicts land in the TA's review queue only. This file records the choices behind that, so that anyone on
the team can defend them and so that the next PA starts from the same ground.

Sources: class brief §3–§6, PA#3 rubric, the product owner's FAQ
([FAQ-01](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-01),
[FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02),
[FAQ-05](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-05),
[FAQ-08](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08),
[FAQ-09](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-09),
[FAQ-10](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-10)), session 6 slides §14–16,
`CLAUDE.md`, `leetkob-eval/README.md`, and the PA#2 contract `docs/contract/post-lab-submissions.md`.

## Summary

| # | Decision | In one line |
|---|---|---|
| 1 | Queue | A `jobs` table in the same SQLite database, claimed with a lease |
| 2 | Worker | A separate process, `npm run worker`; the request handler only enqueues |
| 3 | Sandbox | The worker runs one hardened `docker run` per submission; code and tests go in on stdin |
| 4 | Limits | The FAQ-05 defaults: `g++ -std=c++17 -O2`, CPU 1 s, wall 3×, 256 MB, 16 processes, 1 MB output |
| 5 | Hard rules | A hand-written C++ lexer and name resolver; banned names are read from the constraint text |
| 6 | Model | Gemini `gemini-2.5-flash` over REST with `fetch`, JSON output; free tier, spending cap 0 USD |
| 7 | Output checks | A hand-written validator; bad output or a timeout becomes `unsure` with a reason |
| 8 | Calls | One model call per submission, covering all of its semantic constraints |
| 9 | What is reviewed | Every Accepted submission that is still its student's latest; the queue shows the counted one |
| 10 | Review queue | Every `violation`, every `unsure`, and ceil(10%) of the `pass` verdicts; TA of another class 404, student 403 |
| 11 | Marks | No Publish in PA#3; nothing turns a verdict into a mark |
| 12 | Accounts | Created by a bootstrap script; labs only through the API or the UI |
| 13 | UI | Static HTML and vanilla JS served by Express |
| 14 | Call log | `calls.jsonl` with the provider's request id, tokens, time and cost |
| 15 | Deployment | One VM: API and worker as systemd services on the host, Caddy for HTTPS |
| 16 | Module boundaries | `src/types.ts`: `JudgeFn` and `ReviewFn`, with fakes for tests |

---

## 1. Queue: a `jobs` table in SQLite

**Context.** The rubric deducts if the "queue" is a direct call from the request handler, and it checks
that a submission made while the worker is stopped is judged exactly once after it starts again. The
brief expects up to 80 submissions close to a deadline (FAQ-03).

**Decision.** A `jobs` table (`submission_id UNIQUE`, `status`, `attempts`, `locked_until`, `last_error`)
in the database that already holds the submissions. `POST /labs/{labId}/submissions` inserts the
submission and its job **in one transaction**, so a submission never exists without a job. A worker
claims a job with one `UPDATE … WHERE id = (SELECT … WHERE status = 'queued' OR locked_until < now)`, which
sets a lease of 2 minutes. Results are written with `INSERT … ON CONFLICT DO NOTHING` on
`judge_results(submission_id)` and `constraint_verdicts(submission_id, constraint_id)`, so running a job
twice still leaves one set of results.

**Rejected.** Redis or BullMQ: a new service and a new dependency (CLAUDE.md), for a load SQLite handles. An
in-memory queue: lost on restart, which is exactly what the rubric tests.

**Risks.** SQLite allows one writer at a time; with WAL mode and short transactions this is fine at 80
submissions, but it caps us at one machine. A job that crashes the worker every time would loop:
`attempts` is capped at 3, after which the submission is marked as a system error for the TA.

## 2. Worker: a separate process

**Context.** Judging takes seconds and runs untrusted code; the API must stay responsive and must never
hold the Docker permission.

**Decision.** `src/worker.ts`, started with `npm run worker`, polls the `jobs` table every 500 ms and runs
one job at a time per process. Only the worker's system user is in the `docker` group; the API's is not.
The worker is the only writer of `submissions.status` after `queued`.

**Rejected.** Running jobs inside the API process (`setImmediate`, worker threads): the API would need the
Docker permission, and a stopped API would mean a stopped judge.

**Risks.** One job at a time is slow under a burst: 80 submissions × a few seconds each is a few minutes.
Acceptable for PA#3 (the deadline is compared with the time the server *received* the submission,
FAQ-03); PA#4 can run several workers, which the lease already allows.

## 3. Sandbox: one hardened container per submission

**Context.** Brief §5 and slides §14–16 list nine minimums: no network, CPU limit, wall-clock limit that
kills the whole container, memory limit including swap, process limit, output limit, non-root user, no
host mount and no Docker socket, no secrets. Each needs an attack submission that runs in CI.

**Decision.** The worker spawns, for each submission:

```text
docker run -i --rm --name job-<id> --network none --user 65534:65534 \
  --read-only --tmpfs /tmp:rw,exec,nosuid,size=64m \
  --memory 256m --memory-swap 256m --pids-limit 16 --cpus 1 \
  --cap-drop ALL --security-opt no-new-privileges leetkob-judge
```

- The code and the test inputs go in **on stdin** as a tar; nothing is mounted. Expected outputs never
  enter the container: the worker compares outputs itself, token by token, ignoring whitespace.
- The `docker` process is spawned with an environment of **`PATH` only**, never `process.env`, so no key
  can reach it.
- The wall clock is enforced by the worker: on timeout it runs `docker kill job-<id>`, which kills the
  whole container, not one process.
- The image `docker/judge.Dockerfile` holds `g++` and a run script only, pinned by digest, with no app
  source, `.env` or `node_modules`.

**Rejected.** Judge0: another service to run and secure, no `MLE` verdict (FAQ-05 note), and it would not
show that we understand the minimums. gVisor or Firecracker: stronger isolation, but not available on
the CI runner or a small VM in the time we have. Mounting a work directory: a host mount is forbidden.

**Risks.** Docker isolation shares the host kernel; a kernel exploit escapes it. Some VMs do not enforce
swap limits ("No swap limit support" in `docker info`), which would let the memory attack pass; we check
this first when we set up the deployment. Starting a container costs about a second per submission.

## 4. Limits: the FAQ-05 defaults

**Decision.** Compile with `g++ -std=c++17 -O2` within 10 s; CPU 1 s per test (TA may set 1–5 s); wall
time 3× CPU; memory 256 MB (TA may set 64–512 MB); 16 processes including threads; 1 MB of output per
test. Over the output limit the student sees `RE`, as FAQ-05 says; internally the judge records
`output_limit` so the TA and the logs can tell why.

**Rejected.** The 64-process example in the slides: FAQ-05 is the product owner's decision and is stricter.

**Risks.** `--pids-limit` counts the run script too; the attack test checks that a fork bomb is stopped
and that a normal solution still runs.

## 5. Hard rules: a lexer and a name resolver

**Context.** Rubric criterion 3: ban-list constraints are decided by a syntax-aware rule before the model,
with zero wrongful deductions on the dev set when the model is off. The held-out set has **different
problems**, so nothing may be tuned per problem.

**Decision.** A constraint is a ban list exactly when its text starts with "Do not use" or "Do not call"
(`leetkob-eval/README.md`); the banned names are the backticked strings in that text. A hand-written
lexer drops comments, string, character and raw-string literals while keeping line numbers; a resolver
tracks `using namespace std`, `using std::X`, namespace aliases, simple `#define`s and the student's own
functions and namespaces. A banned `std::X` is a violation when a use resolves to `std`; an unqualified
banned name (`goto`, `qsort`) is a violation when it appears as a code token and is not the student's own.
Evidence is the original source line. **When unsure on a ban list, the rule answers `pass`**: a wrongful
deduction costs a student real marks, a miss only costs recall.

**Rejected.** `grep` on raw text: flags comments, strings and the student's own `sort` (the `trap` cases).
tree-sitter or libclang: a new dependency (native for libclang), and still needs the same resolver.

**Risks.** A lexer is not a full C++ parser: templates, function pointers and macros that build names
from tokens can hide a use. Known gaps are listed in the AI-LOG and covered by tests as they are found.

## 6. Model: Gemini `gemini-2.5-flash`, free tier

**Context.** The PA#2 README named this model and a spending cap of 0 USD, and said the team would decide
on billing before PA#3. The team decided on 2026-11-23 to stay on the free tier.

**Decision.** Call the Gemini REST API with `fetch` (no SDK), asking for JSON with a response schema, and
`AbortSignal.timeout` on every call. The key is read from `LLM_API_KEY` in the server and worker
environment only — never the browser, the sandbox, a log or a prompt. The prompt holds the statement, the
semantic constraints (id and text, **never the deduction**) and the code with comments removed and lines
numbered; it says that everything inside the code is data, not instructions. No student name or id is
sent.

**Rejected.** The official SDK: a new dependency for one POST request. A paid tier: the team chose the 0 USD
cap; the cost per lab is still computed at the paid price, so the number is known if that changes.

**Risks.** The free tier **may use submitted content to improve Google's products**; the AI-LOG states
this and why it is acceptable (only the statement, the constraints and de-identified code leave the
system). Free-tier rate limits slow a burst; the worker spaces its calls and a refused call becomes
`unsure` (`model-error`), never a verdict.

## 7. Output checks: validator and timeout

**Context.** Rubric criteria 4–6 are worth zero if the model's output reaches the TA without a schema
check and a timeout.

**Decision.** A hand-written validator for the one response shape. Not JSON, a missing field, an unknown
verdict, an unknown constraint, or any field that looks like a mark or a deduction → that constraint is
`unsure` with `unsureReason: 'schema'`. A call past its timeout → `unsure` with `'timeout'`. Evidence whose
text does not match the original line → `unsure` with `'evidence-mismatch'`. One broken constraint does
not spoil the others of the same submission. Both limits have tests with a fake model and no network.

**Rejected.** `zod` or `ajv`: a new dependency for one schema.

**Risks.** FAQ-09 also lists "the lab went over its cost cap" as a reason for `unsure`. With a 0 USD
free tier there is no per-lab budget yet; adding the reason `cost-cap` is left for PA#4.

## 8. One model call per submission

**Decision.** One call per reviewed submission, holding all of its semantic constraints, rather than one
call per constraint.

**Rejected.** One call per (submission, constraint): about twice the calls and tokens for the dev set, and
each call sees less context.

**Risks.** One bad answer can affect several constraints; the validator judges each constraint's entry on
its own (decision 7).

## 9. Which submissions are reviewed

**Context.** FAQ-02: the counted submission is the student's **last one before the deadline**, whatever its
result; only it reaches the TA's queue; before the deadline the queue shows the latest one so far. A team
may review Accepted submissions early. FAQ-04: a submission that is not Accepted gets no constraint review.

**Decision.** The worker reviews a submission when it is Accepted **and** is still its student's latest
submission for the lab when the review starts; an older one is skipped (`superseded`) without calling the
model. The review queue shows only each student's latest submission.

**Rejected.** Reviewing only after the deadline: the queue would be empty until then, and the rubric's
flow (create a lab, submit, open the queue) happens before any deadline.

**Risks.** A student who resubmits many times still costs one review per Accepted resubmission that was
latest when the worker reached it.

## 10. Review queue and who may see it

**Decision.** `GET /labs/{labId}/review-queue` lists every `violation`, every `unsure` and a random
ceil(10%) of the `pass` verdicts of the lab's counted submissions (FAQ-10), each with its evidence lines,
the deduction **from the TA's constraint**, the source (`hard-rule` or `model`) and the `unsure` reason
(FAQ-09). A TA of the class and the admin may see it. A TA of another class gets **404**, as if the lab
did not exist (the PA#2 rule: never reveal that a resource exists). A student gets **403**: students know
labs of their own class exist, and the role matrix in slide §14 forbids them the queue. A student never
sees a constraint verdict through any endpoint before marks are published (FAQ-08).

**Risks.** Telling apart "a student of this class" (403) and "a student of another class" (404) is one more
branch that needs its own contract test.

## 11. No Publish in PA#3

**Decision.** Nothing in PA#3 turns a verdict into a mark. There is no Publish endpoint; it comes in a
later PA, and it will refuse while any verdict is unreviewed (FAQ-09, FAQ-12).

**Rejected.** Building Publish now: more surface that must be proved safe, for no PA#3 marks.

## 12. Accounts by script, labs by API

**Context.** FAQ-01: the admin creates classes and assigns TAs; students join by an invite code or are
added by a TA. The rubric deducts if a **lab** has to be created by a seed script.

**Decision.** `npm run accounts` creates the admin, TA and student accounts and the classes for a
deployment, with passwords taken from the command line or the environment (never committed). Labs are
created only through `POST /classes/{classId}/labs`, by a TA of that class or the admin. `POST /auth/login`
issues the same Bearer token as PA#2; a wrong password and an unknown user get the same `401`. Passwords
are hashed with `crypto.scrypt`.

**Risks.** FAQ-01 asks for at least one way for students to join (invite code or added by a TA). The
script stands in for "added by a TA" in PA#3; a real endpoint for it is the first follow-up.

## 13. UI: static pages

**Decision.** Static HTML and vanilla JS in `public/`, served by Express: sign in, create a lab, submit and
see the result, the review queue. Hiding a button is not access control (slide §15): every check is on the
server. Student code is hostile data: every string is escaped before it reaches the DOM.

**Rejected.** React or another framework: a build step and new dependencies; the rubric accepts "screens or
API".

## 14. Call log

**Decision.** Every model call appends one line to a JSONL call log: the provider's request id
(`responseId` in Gemini's response), model, prompt and output tokens, time, cost at the paid price, the
submission, and the prompt that was sent. Constraints that a hard rule decided are logged as skipped, to
show that the model was not called for them. The committed dev-set run keeps it as
`runs/dev-<date>/calls.jsonl` — `.jsonl`, because `.gitignore` drops `*.log`.

**Risks.** The prompt in the log contains de-identified student code; the deployment's log stays on the
server and is never committed.

## 15. Deployment: one VM

**Decision.** One Ubuntu VM with Docker. The API and the worker run as systemd services **on the host**,
each under its own user; only the worker's user is in the `docker` group, and no container is given the
Docker socket. Caddy terminates HTTPS. The key lives in an environment file readable only by those
services (`chmod 600`). The deployment stays up until the PA#4 marks are out.

**Rejected.** A PaaS (Render, Railway, Vercel): it cannot start Docker containers, so the sandbox cannot
run there. Running the worker in a container: it would need the Docker socket, which the minimums forbid
for anything that touches student code.

**Risks.** A single VM is a single point of failure, and the test accounts in a public repo let anyone use
it; the 0 USD cap bounds the damage to the model quota.

## 16. Module boundaries

**Decision.** `src/types.ts` defines `JudgeFn` (sandbox) and `ReviewFn` (hard rules, then the model).
The worker depends only on these types; `test/helpers/fakes.ts` provides `fakeJudge` and `fakeReview`, so
the queue, the worker and the review queue are tested without Docker or a network, and the real
implementations are swapped in with one import.
