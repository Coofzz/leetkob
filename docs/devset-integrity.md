# Dev set integrity

`leetkob-eval/` is the published LeeTKOB dev set, imported from
[fithcmus/awad-leetkob-eval](https://github.com/fithcmus/awad-leetkob-eval) at `552c811`. The PA#3 rubric
compares it byte for byte with the published copy (`eval.mjs` sha256 starts `c836edd8713521bb`,
`labels.jsonl` starts `262cda7b0ef5612e`); a changed dev set scores criterion 6 at 0.

**Never edit, format or lint anything under `leetkob-eval/`.** Our own cases go in a separate folder with
the same layout.

## Why it needs guarding

Git for Windows ships with `core.autocrlf=true`: on checkout it turns LF into CRLF. The text looks the same,
the bytes and the hash do not, and evidence lines no longer match the source exactly. `git archive` does the
same. Editors and `npm run format` can also rewrite the files.

## The guard

| File | What it does |
|---|---|
| `.gitattributes` | `leetkob-eval/** -text`: Git never converts line endings there, whatever `core.autocrlf` says |
| `.editorconfig` | editors do not trim whitespace or add a final newline inside `leetkob-eval/` |
| `.prettierignore`, `eslint.config.js` | `npm run format` and `npm run lint` skip `leetkob-eval/` |
| `scripts/verify-devset.mjs` + `leetkob-eval.sha256` | compares all 128 files with the published hashes; reports changed, missing and extra files and says when the cause is CRLF. The two rubric hashes are hard-coded, so a manifest regenerated from a broken copy still fails |
| `.githooks/pre-commit` | runs the check before every commit |
| CI job `devset` | runs the check on Ubuntu and Windows on every pull request |

Each member, once per clone:

```bash
git config core.hooksPath .githooks
node scripts/verify-devset.mjs     # must print: OK, 128 files byte-for-byte identical
```

Never regenerate `leetkob-eval.sha256` to make the check pass, and never commit with `--no-verify` when the
hook complains about the dev set.

## Updating to a new published version

Only when the lecturer publishes a new dev set, by one person, in its own pull request:

```bash
git -C ../awad-leetkob-eval pull
git rm -r -q leetkob-eval && mkdir leetkob-eval
git -C ../awad-leetkob-eval -c core.autocrlf=false archive HEAD | tar -x -C leetkob-eval   # -c ... is required
```

Then regenerate `leetkob-eval.sha256` from the upstream commit (not from files on disk), update `ANCHORS` in
`scripts/verify-devset.mjs` to the hashes the lecturer announces, and run `node scripts/verify-devset.mjs`.
