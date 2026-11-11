# LeeTKOB — rules for the assistant

Constraint review for C++ labs: a wrong deduction costs a real student real marks. When unsure, stop and ask.

## Stack
Node 22 (.nvmrc) + TypeScript run directly with tsx, no build step · Express 5 · SQLite via built-in node:sqlite, no ORM · node:test · ESLint + Prettier + tsc --noEmit.
Nothing else without asking: no new dependency, framework, ORM or test runner.

## Commands
npm run lint · npm run format:check · npm run typecheck · npm test · npm run test:contract
- Run all five before saying a change is done. Report the real output, not "should pass".
- CI runs exactly these five, one job each. Fix formatting with `npm run format`. Server: `npm start` (http://localhost:3000).

## Conventions
- Every error is RFC 9457 problem details built with src/problem.ts. Clients branch on `type`, so never invent a type the contract does not list.
- docs/contract/ is the spec. Code follows the contract; never change the contract to match the code.
- Schema change = new migrations/NNN_*.up.sql + matching .down.sql. Never edit a migration that has already run.
- No console.log (console.error/warn only), no `any`. Imports keep the .ts extension: `import { sendProblem } from './problem.ts'`.
- Contract test names start with the contract section number: `§3 ...`.
- Tests and code go in separate commits. One branch per change, through a PR, merged with a merge commit (no squash).
- Reply to me in Vietnamese; code, identifiers and commit messages in English.

## Never
- Edit a test, the eval data or a label to make a check pass. If a test looks wrong, stop and explain why.
- Call a real model in unit or contract tests. Use the fake client.
- Give the judging sandbox any secret, network access, root, a host mount or the Docker socket.
- Send a student's name or student ID to the model. Send only the statement, the constraints and de-identified code.
- Let the model decide a deduction (the TA does), or publish marks before the TA has reviewed them.
- Read or print .env. Never put a key in code, logs, prompts or commits.
- Push to main, or force-push.
- Mount a global body parser (`app.use(express.json())`). Parse the body inside the route, after the ownership check. Why: the skeleton had one, so a bad body from another class got invalid-json instead of 404 and leaked that the lab exists; test "§4 ownership is checked before the body" went red in PR #3 (https://github.com/Coofzz/leetkob/pull/3), fixed in commit https://github.com/Coofzz/leetkob/commit/160cfb9.
- Pipe a check command (`npm test | grep pass`). The pipe keeps the last command's exit code, so the check can never fail. Use `--test-reporter=spec`. Why: while building the skeleton, `npm test | grep "pass"` printed nothing and hid whether the tests had failed; see AI-LOG.md, 2026-11-11.

## Permissions (enforced in .claude/settings.json)
- Allowed (local only, undone with one command): the five checks, `npm run format`, `git status`, `git diff`, `git log`.
- Ask first (touches shared things, still reversible): `git commit`, `git push`, `npm install`; editing migrations/, .github/, CLAUDE.md, docs/contract/.
- Never (irreversible, or rewrites the shared record): reading .env; editing test/contract/; `git push --force`; `git push origin main`; `git tag`.