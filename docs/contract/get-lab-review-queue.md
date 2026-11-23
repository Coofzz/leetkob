# Contract — `GET /labs/{labId}/review-queue`

Status: PA#3 · Owner: Trần Thanh An · Product: LeeTKOB (class project brief §3)

The TA's review queue: the constraint verdicts of a lab that a TA must look at before any mark is
published. This is the **only** place a verdict goes; nothing turns a verdict into a mark in PA#3, and
there is no publish endpoint yet.

Contract tests: `test/contract/review-queue.test.ts`; a test name starts with the section it checks.

## 1. Conventions

As in `post-lab-submissions.md` §1, including `Authorization: Bearer <token>` (missing, malformed or
unknown → `401 unauthenticated` with `WWW-Authenticate: Bearer`).

## 2. Errors

| `type` (after `https://leetkob.example/problems/`) | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No `Authorization` header, not `Bearer <token>`, or an unknown token |
| `forbidden` | 403 | The caller is a **student of this lab's class** (§3) |
| `not-found` | 404 | The lab does not exist, `labId` is not a positive integer, or the caller is not in its class (§3) |
| `internal` | 500 | Our fault; `detail` is a fixed sentence |

## 3. Who may see it

| Caller | Answer |
|---|---|
| A TA of the lab's class, an admin | `200` |
| A student of the lab's class | `403 forbidden`: the student knows the lab exists (they submit to it) but may not see the queue |
| A TA of another class, a student of another class | `404 not-found`, exactly as if the lab did not exist |

## 4. Response — `200 OK`

```json
{
  "labId": 7,
  "countedSubmissions": 12,
  "pendingSubmissions": 1,
  "passVerdicts": 15,
  "sampledPass": 2,
  "items": [
    {
      "submissionId": 42, "studentId": 1001, "studentName": "Alice",
      "constraint": "C1", "text": "Do not call …", "deduction": 3,
      "verdict": "violation", "source": "hard-rule",
      "evidence": [ { "line": 12, "text": "  std::sort(a, a + n);" } ],
      "unsureReason": null, "reason": null,
      "inSample": false
    }
  ]
}
```

- **Counted submission**: each student's latest submission to the lab
  ([FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02)). Before the deadline it is
  the latest so far. Verdicts of earlier submissions never appear.
- **`items`**: every `violation`, every `unsure`, and `sampledPass` of the `pass` verdicts, where
  `sampledPass` = ceil(10% × `passVerdicts`): a lab with at least one `pass` has at least one in the sample
  ([FAQ-10](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-10)). A verdict is one
  (counted submission, constraint) pair. The sample is chosen at random once per verdict and does not
  change between requests. Items are ordered: violations, then unsure, then the sampled passes.
- **`deduction`** is the TA's, from the lab; the model never sets it.
- **`unsureReason`** tells the TA why ([FAQ-09](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-09)):
  `model-unsure`, `schema`, `evidence-mismatch`, `timeout`, `model-error`, `model-off`.
- **`pendingSubmissions`**: counted submissions not reviewed yet (still being judged, or Accepted and
  waiting for the review).

Students never see any of this before marks are published
([FAQ-08](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08)): no endpoint returns a
constraint verdict to a student.

## 5. Change policy

As in `post-lab-submissions.md` §7.
