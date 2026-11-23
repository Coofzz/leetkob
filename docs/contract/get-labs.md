# Contract — `GET /labs` and `GET /labs/{labId}`

Status: PA#3 · Owner: Trần Thanh An · Product: LeeTKOB (class project brief §3, §4.1)

What the screens need to show a lab: the labs of the caller's classes, and one lab's statement with its
constraints and the deduction of each — students see them from the moment the lab opens
([FAQ-06](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-06)). The tests are never shown
([FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02)).

Contract tests: `test/contract/labs-read.test.ts`; a test name starts with the section it checks.

## 1. Conventions

As in `post-lab-submissions.md` §1, including `Authorization: Bearer <token>` (missing, malformed or
unknown → `401 unauthenticated` with `WWW-Authenticate: Bearer`).

## 2. Errors

| `type` (after `https://leetkob.example/problems/`) | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No `Authorization` header, not `Bearer <token>`, or an unknown token |
| `not-found` | 404 | `GET /labs/{labId}`: the lab does not exist, `labId` is not a positive integer, or the caller is not in its class |
| `internal` | 500 | Our fault; `detail` is a fixed sentence |

## 3. `GET /labs` — `200 OK`

The labs of every class the caller belongs to (as a student or a TA); an admin gets every lab. Ordered by
deadline, then id.

```json
{ "labs": [ { "id": 7, "classId": 1, "className": "CSC13114 — class A", "title": "Merge sort", "deadlineAt": "2026-12-01T16:59:59.000Z" } ] }
```

## 4. `GET /labs/{labId}` — `200 OK`

A student or a TA of the lab's class, or an admin. Everyone else gets the `404` of a missing lab.

```json
{
  "id": 7, "classId": 1, "title": "Merge sort",
  "statement": "Read n integers …",
  "deadlineAt": "2026-12-01T16:59:59.000Z",
  "limits": { "cpuMs": 1000, "memoryMb": 256 },
  "testCount": 3,
  "constraints": [ { "id": "C1", "text": "Do not call …", "deduction": 3 } ],
  "mySubmissions": [ { "id": 42, "status": "accepted", "submittedAt": "2026-11-24T14:59:58.123Z" } ]
}
```

| Field | Meaning |
|---|---|
| `constraints` | In the TA's order, with the deduction out of 10 (FAQ-06). |
| `testCount` | How many tests; never their input or output. |
| `mySubmissions` | **Only for a student**: their own submissions to this lab, newest first, with the status as `GET /submissions/{id}` shows it. Absent for a TA or an admin. |

## 5. Change policy

As in `post-lab-submissions.md` §7.
