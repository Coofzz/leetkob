# Contract — `GET /submissions/{id}`

Status: PA#3 · Owner: Trần Thanh An · Product: LeeTKOB (class project brief §3, §4.2)

A student follows a submission from `queued` to its result: the overall verdict and the verdict of each
test, never the tests' input or output
([FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02)) and never a constraint
verdict before marks are published
([FAQ-08](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08)). A TA of the class also sees
the constraint review.

Contract tests: `test/contract/get-submission.test.ts`; a test name starts with the section it checks.

## 1. Conventions

As in `post-lab-submissions.md` §1, including `Authorization: Bearer <token>` (a missing, malformed or
unknown token is `401 unauthenticated` with `WWW-Authenticate: Bearer`). Clients must treat an unknown
`status` as "still in progress".

## 2. Errors

| `type` (after `https://leetkob.example/problems/`) | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No `Authorization` header, not `Bearer <token>`, or an unknown token |
| `not-found` | 404 | The submission does not exist, `id` is not a positive integer, **or the caller may not see it** (§3) |
| `internal` | 500 | Our fault; `detail` is a fixed sentence |

## 3. Who may see it

- **The student who submitted it**; **a TA of the lab's class**; **an admin**.
- Everyone else — another student, even of the same class, a TA of another class — gets **`404 not-found`,
  exactly as if the submission did not exist**.

## 4. Response — `200 OK`

```json
{
  "id": 42,
  "labId": 7,
  "studentId": 1001,
  "language": "cpp",
  "codeBytes": 1834,
  "code": "#include <cstdio>\n…",
  "submittedAt": "2026-11-24T14:59:58.123Z",
  "status": "wrong_answer",
  "result": {
    "status": "wrong_answer",
    "tests": [
      { "idx": 0, "verdict": "AC", "timeMs": 4 },
      { "idx": 1, "verdict": "WA", "timeMs": 3 }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `status` | `queued` → `judging` → one of `accepted`, `wrong_answer`, `time_limit`, `memory_limit`, `runtime_error`, `compile_error`, or `system_error` (the judge failed three times; the TA is told). |
| `result` | `null` until the submission is judged. |
| `result.tests` | In the TA's order: `idx` (0-based), `verdict` (`AC`, `WA`, `TLE`, `MLE`, `RE`), `timeMs`. **No input, no expected or actual output.** |
| `result.compileError` | Only for `compile_error`: the compiler's message, at most 4 KiB. |

Output over the 1 MB limit is reported as `runtime_error` / `RE`
([FAQ-05](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-05)).

### Only for a TA of the class or an admin: `review`

```json
"review": {
  "state": "done",
  "verdicts": [
    {
      "constraint": "C1", "text": "Do not call …", "deduction": 3,
      "verdict": "violation", "source": "hard-rule",
      "evidence": [ { "line": 12, "text": "  std::sort(a, a + n);" } ],
      "unsureReason": null, "reason": null
    }
  ]
}
```

`state` is `pending` (not reviewed yet), `done`, or `not-reviewed` (not Accepted, or not the student's
latest submission: FAQ-02). `deduction` is the TA's, from the lab. **A student's response has no `review`
field at all**, whatever the state.

## 5. Change policy

As in `post-lab-submissions.md` §7.
