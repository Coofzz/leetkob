# Contract — `POST /labs/{labId}/submissions`

Status: frozen for PA#2 · Owner: Nguyễn Viết Toàn · Product: LeeTKOB (class project brief §4.2)

A student submits C++ code for a lab. The submission is queued for judging in the sandbox (PA#3).
A retried request — a phone on bad Wi-Fi, a double click a minute before the deadline — must never create
two submissions.

This file is the whole contract: a client written from it alone must work. Contract tests in
`test/contract/submissions.test.ts` check each numbered rule; a test name starts with the section it checks.

## 1. Conventions

- Base URL: the deployment's origin, e.g. `http://localhost:3000`. Paths below are relative to it.
- Request and response bodies are JSON (UTF-8). A successful response has `Content-Type: application/json`;
  an error has `Content-Type: application/problem+json` (§2).
- **Clients must ignore response fields they do not know.** New fields may appear at any time (§7).
- The server ignores request fields it does not know.
- Times are ISO 8601 in UTC with milliseconds, e.g. `2026-11-11T14:59:58.123Z`.
- Ids are positive integers.

### Authentication

Every request carries `Authorization: Bearer <token>`. In PA#2 a token is issued per user by the admin
(seeded); a login endpoint comes later and will issue the same kind of token. A missing, malformed or
unknown token is `401 unauthenticated` (§2), with the header `WWW-Authenticate: Bearer`.

## 2. Errors

Every response with a 4xx or 5xx status is a problem details object (RFC 9457):

```json
{
  "type": "https://leetkob.example/problems/validation",
  "title": "Invalid request",
  "status": 400,
  "detail": "2 fields are invalid",
  "errors": [
    { "pointer": "/language", "detail": "must be \"cpp\"" },
    { "pointer": "/code", "detail": "must be a non-empty string" }
  ]
}
```

- `type` is the contract: **clients branch on `type`**, never on `title` or `detail`, which are for people
  and may change.
- `status` repeats the HTTP status.
- `errors` appears only on `validation`: one entry per broken field — **every** broken field, not the first
  one — with a JSON pointer into the request body and a sentence.

| `type` (after `https://leetkob.example/problems/`) | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No `Authorization` header, not `Bearer <token>`, or an unknown token |
| `not-found` | 404 | The lab does not exist, `labId` is not a positive integer, **or the caller may not submit to it** (§3) |
| `idempotency-key-missing` | 400 | No `Idempotency-Key` header, or one that breaks the rule in §5 |
| `code-too-large` | 413 | The request body is larger than 256 KiB, or `code` is longer than 65 536 bytes in UTF-8 |
| `invalid-json` | 400 | The body is not valid JSON |
| `validation` | 400 | Valid JSON that breaks a field rule of §4; lists every broken field in `errors` |
| `idempotency-key-in-flight` | 409 | Another request of the same student with the same key is still being processed (§5) |
| `idempotency-key-reused` | 422 | The student already used this key with a different body (§5) |
| `deadline-passed` | 422 | The lab's deadline has passed; `detail` names the deadline |
| `internal` | 500 | Our fault. `detail` is a fixed sentence: never a table, a path, a query or an exception message |

No other values of `type` are returned by this endpoint.

## 3. Who may call it — role and ownership

- **Only a user with role `student` who is enrolled in the lab's class** may submit to that lab.
- Everyone else gets **`404 not-found`, exactly as if the lab did not exist**: a student of another class,
  a TA (even of this class — TAs do not submit), an admin.
- Why 404 and not 403: a 403 would tell a student of another class that lab 7 exists and what it is
  called. The response for "not yours" and "does not exist" is byte-for-byte the same shape, with the
  same `type` and the same `detail` wording.
- Ownership is checked **before** the request body is read: a caller who may not submit learns nothing
  about the body rules.

## 4. Request and response

```
POST /labs/{labId}/submissions
Authorization: Bearer <token>
Idempotency-Key: 6f1c2e0a-8d9b-4c55-a3f1-2b7e9c1d0e44
Content-Type: application/json

{ "language": "cpp", "code": "#include <vector>\nint main() { ... }" }
```

| Field | Rule |
|---|---|
| `language` | Required. Exactly the string `"cpp"`. No other language is supported (brief §4, "Out"). |
| `code` | Required. A string of 1 to 65 536 bytes in UTF-8. Longer is `413 code-too-large`, not `validation`. |

The body itself must be a JSON object; anything else (an array, a string, `null`) is `validation` with
`pointer` `""`.

### Order of checks

The server checks in this order and answers with the first rule that fails:

1. Authentication → `401 unauthenticated`.
2. The lab exists and the caller may submit to it (§3) → `404 not-found`.
3. `Idempotency-Key` present and valid → `400 idempotency-key-missing`.
4. Body size (256 KiB) → `413 code-too-large`.
5. JSON syntax → `400 invalid-json`.
6. The key was used before by this student (§5) → replay, `422 idempotency-key-reused` or
   `409 idempotency-key-in-flight`.
7. Field rules → `400 validation` (every broken field), then `code` length → `413 code-too-large`.
8. Deadline → `422 deadline-passed`.
9. The submission is created → `201`.

### Success — `201 Created`

```
HTTP/1.1 201 Created
Content-Type: application/json
Location: /submissions/42

{
  "id": 42,
  "labId": 7,
  "studentId": 1001,
  "language": "cpp",
  "codeBytes": 1834,
  "status": "queued",
  "submittedAt": "2026-11-11T14:59:58.123Z"
}
```

| Field | Meaning |
|---|---|
| `id` | The new submission. `Location` is `/submissions/{id}` (that `GET` endpoint arrives in PA#3). |
| `labId`, `studentId` | The lab from the path; the caller. |
| `codeBytes` | Length of `code` in UTF-8 bytes, so the client can check nothing was cut. |
| `status` | Always `"queued"` in this response. Later states (judging, accepted, …) are seen through `GET`. |
| `submittedAt` | Server time when it was accepted. This, not the client's clock, is compared with the deadline. |

The deadline: a submission whose `submittedAt` is **at or before** the lab's `deadlineAt` is on time.
There are no late submissions: after the deadline every new submission is `422 deadline-passed`.

A student may submit to the same lab many times; each new key creates a new submission. Which one is
marked is decided by the TA's rules (brief §3), not by this endpoint.

## 5. Idempotency

- `Idempotency-Key` is **required**. Its value is 1 to 255 visible ASCII characters (`!` to `~`); a UUID is
  a good choice. One key per intended submission.
- **A key belongs to one student.** Two students who happen to send the same key do not affect each other.
- Two bodies are *the same* when they are equal as JSON values: key order and whitespace do not matter,
  any other difference does — including a field the server ignores.

| The server sees | It answers |
|---|---|
| A key this student has not used | Checks 7–9, then `201` and the key is stored |
| The same key, the same body | The **stored** response: same status, same body, same `Location`, plus `Idempotent-Replayed: true`. No new submission. |
| The same key, a different body | `422 idempotency-key-reused`. Nothing is created. |
| The same key while the first request is still being processed | `409 idempotency-key-in-flight`. Retry after a short wait. |

- A request is *being processed* from the moment it passes check 3 until its response is sent.
- **Only a `201` is stored.** After a `400`, `413` or `422 deadline-passed` the key is not used up: the client
  may fix the body and retry with the same key.
- A replay is answered even after the deadline: the submission it returns was accepted on time.
- A stored key is kept for at least 7 days. A client must never reuse a key for a different submission.

## 6. Paging

This endpoint creates one resource and does not return a list, so it has no paging.

## 7. Change policy

- **Additive changes, without notice:** a new response field; a new optional request field; a new value of
  `status` in later responses (clients must treat an unknown `status` as "still in progress"); a new
  problem `type` for a new situation (clients must treat an unknown `type` by its HTTP status).
- **Breaking changes** need a new version of the path (`/v2/...`) announced on Classroom at least two weeks
  before; the old path then keeps its behaviour, errors included, until it is removed. Breaking means:
  removing or renaming a field, changing a type or a unit, making an optional field required, tightening a
  rule, changing a status code or a problem `type`.
- This file changes only through a pull request that a human reviews. Code that disagrees with it is a bug
  in the code.

## 8. Not covered

Rate limiting, file uploads (multipart), and reading or listing submissions are out of this contract.
