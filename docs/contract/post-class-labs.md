# Contract — `POST /classes/{classId}/labs`

Status: PA#3 · Owner: Trần Thanh An · Product: LeeTKOB (class project brief §3, §4.1)

A TA creates a lab in a class they teach: the statement, the tests the sandbox judges against, the
limits, and the constraints with the deduction the TA sets for each. The model never sets a deduction.

Contract tests: `test/contract/labs.test.ts`; a test name starts with the section it checks.

## 1. Conventions

As in `post-lab-submissions.md` §1, including `Authorization: Bearer <token>` (a missing, malformed or
unknown token is `401 unauthenticated` with `WWW-Authenticate: Bearer`). The request is **not**
idempotent: sending it twice creates two labs.

## 2. Errors

| `type` (after `https://leetkob.example/problems/`) | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No `Authorization` header, not `Bearer <token>`, or an unknown token |
| `not-found` | 404 | The class does not exist, `classId` is not a positive integer, **or the caller may not create labs in it** (§3) |
| `body-too-large` | 413 | The request body is larger than 8 MiB |
| `invalid-json` | 400 | The body is not valid JSON |
| `validation` | 400 | Valid JSON that breaks a field rule of §4; lists every broken field in `errors` |
| `internal` | 500 | Our fault; `detail` is a fixed sentence |

No other values of `type` are returned by this endpoint.

## 3. Who may call it

- **A TA of this class**, and **an admin**, may create a lab in it
  ([FAQ-01](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-01)).
- Everyone else — a student (even of this class), a TA of another class — gets **`404 not-found`, exactly as
  if the class did not exist**: same `type`, same `detail` wording. A 403 would confirm that the class exists.
- This is checked **before** the request body is read.

## 4. Request

```
POST /classes/1/labs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Merge sort",
  "statement": "Read n integers and print them in non-decreasing order. …",
  "deadlineAt": "2026-12-01T16:59:59.000Z",
  "limits": { "cpuMs": 1000, "memoryMb": 256 },
  "tests": [ { "input": "3\n2 1 3\n", "output": "1 2 3\n" } ],
  "constraints": [
    { "id": "C1", "text": "Do not call a library sort function: `std::sort`, `std::stable_sort`.", "deduction": 3 },
    { "id": "C2", "text": "Sort with a merge sort you wrote yourself.", "deduction": 4 }
  ]
}
```

| Field | Rule |
|---|---|
| `title` | Required. A string of 1 to 200 characters. |
| `statement` | Required. A string of 1 to 65 536 characters (Markdown). |
| `deadlineAt` | Required. An ISO 8601 time in UTC ending in `Z`, later than the server's clock. |
| `limits` | Optional object. `cpuMs`: an integer from 1000 to 5000, default 1000. `memoryMb`: an integer from 64 to 512, default 256 ([FAQ-05](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-05)). Wall time is 3 × CPU time and is not set here. |
| `tests` | Required. 1 to 100 objects `{ "input": string, "output": string }`. Students never see them ([FAQ-02](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-02)). |
| `constraints` | Optional, default `[]`. 0 to 20 objects. `id`: 1 to 16 characters of `A-Z a-z 0-9 _ -`, unique in the lab. `text`: a string of 1 to 2000 characters. `deduction`: an integer from 0 to 10, the points out of 10 taken off for a violation. |

A constraint whose text starts with "Do not use" or "Do not call" and lists names in backticks is decided by
a hard rule; every other constraint is reviewed by the model. The server does not ask the TA which is which.

The body must be a JSON object; anything else is `validation` with `pointer` `""`.

### Order of checks

1. Authentication → `401 unauthenticated`.
2. The class exists and the caller may create labs in it (§3) → `404 not-found`.
3. Body size (8 MiB) → `413 body-too-large`.
4. JSON syntax → `400 invalid-json`.
5. Field rules → `400 validation` (every broken field).
6. The lab is created → `201`.

## 5. Success — `201 Created`

```
HTTP/1.1 201 Created
Content-Type: application/json
Location: /labs/7

{
  "id": 7,
  "classId": 1,
  "title": "Merge sort",
  "deadlineAt": "2026-12-01T16:59:59.000Z",
  "limits": { "cpuMs": 1000, "memoryMb": 256 },
  "testCount": 1,
  "constraints": [ { "id": "C1", "text": "…", "deduction": 3 }, { "id": "C2", "text": "…", "deduction": 4 } ],
  "createdAt": "2026-11-24T03:12:45.120Z"
}
```

The response does not repeat the statement or the tests. Students of the class can submit to the new lab at
once (`POST /labs/{id}/submissions`).

## 6. Change policy

As in `post-lab-submissions.md` §7.
