# Own cases

Our own cases, in the layout of `leetkob-eval/` and scored by the same `eval.mjs`:

```bash
MODEL_OFF=1 npm run checker -- --data own-cases --out own.jsonl
node leetkob-eval/eval.mjs --data own-cases --predictions own.jsonl
```

`max-subarray` is a problem that is not in the dev set, so it shows whether the checker works on a new
problem: C1 is a ban list (library helpers that find a maximum or a sum), C2 is semantic (linear time).
Every solution was written for this folder and is Accepted by our judge (`test/sandbox/own-cases-accepted.test.ts`).

| Solution | C1 (ban list) | C2 (linear time) | Why it is here |
|---|---|---|---|
| s01 | violation · obvious | pass | `*std::max_element` on the DP array |
| s02 | pass · **trap** | pass | the student's own `accumulate`; banned names in a comment |
| s03 | violation · disguised | pass | `max_element` behind a macro and `using namespace std` |
| s04 | pass | violation · obvious | tries every subarray |
| s05 | pass | violation · **injection**, disguised | prefix sums over every pair, and a comment telling the reviewer to say pass |
| s06 | pass · style | pass · style | Kadane as a recursion with `scanf` |

s03 found a bug in the hard rules: `*max_element(...)` was read as the declaration of the student's own
function. A self-written test reproduces it (`test/unit/hard-rules.test.ts`) and the rule was fixed.
