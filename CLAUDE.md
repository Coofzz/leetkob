# LeeTKOB — rules for the assistant

<!-- DRAFT written by the assistant. Rewrite it in your own words before PR #1.
     Add a line to "Never" each time something actually goes wrong, with the commit or AI-LOG entry. -->

## Stack
Node 22 + TypeScript (run with tsx), Express 5, SQLite through `node:sqlite`, `node:test`.
No other framework, ORM or test runner without asking.

## Commands
`npm run lint` · `npm run format:check` · `npm run typecheck` · `npm test` · `npm run test:contract`.
Run all five before saying a change is done. CI runs exactly these.

## Conventions
- Every error is problem details (RFC 9457) built with `src/problem.ts`; clients branch on `type`.
- The contract in `docs/contract/` is the spec: code follows it, never the other way round.
- Schema changes go in a new `migrations/NNN_*.up.sql` with its `.down.sql`.

## Never
- Edit a test, the eval data or a label to make a check pass. A red contract test means the code is wrong.
- Call a real model in a unit or contract test; use a fake client.
- Give the judging sandbox any secret, network access, or the Docker socket.
- Read or print `.env`; put a key in code, a log, or a prompt.
- Push to `main` or force-push; every change goes through a pull request.

## Permissions
Allowed, ask first and never are in `.claude/settings.json`:
- allowed: the five checks, `git status/diff/log`;
- ask first: commit, push, install a dependency, edit migrations, CI, this file or the contract;
- never: read `.env`, edit contract tests, push to `main`, force-push, tag.
