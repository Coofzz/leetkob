# Contract — `POST /auth/login`

Status: PA#3 · Owner: Trần Thanh An · Product: LeeTKOB (class project brief §4.1)

A user signs in with a username and a password and gets the Bearer token that every other endpoint
expects (`docs/contract/post-lab-submissions.md` §1). Accounts are created by an admin
([FAQ-01](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-01)); there is no sign-up.

Contract tests: `test/contract/login.test.ts`; a test name starts with the section it checks.

## 1. Conventions

As in `post-lab-submissions.md` §1: JSON bodies in UTF-8, errors as `application/problem+json`, clients
ignore fields they do not know. This endpoint takes **no** `Authorization` header.

## 2. Errors

| `type` (after `https://leetkob.example/problems/`) | Status | When |
|---|---|---|
| `body-too-large` | 413 | The request body is larger than 16 KiB |
| `invalid-json` | 400 | The body is not valid JSON |
| `validation` | 400 | Valid JSON that breaks a field rule of §3; lists every broken field in `errors` |
| `unauthenticated` | 401 | The username does not exist, or the password is wrong (§3) |
| `internal` | 500 | Our fault; `detail` is a fixed sentence |

No other values of `type` are returned by this endpoint.

## 3. Request

```
POST /auth/login
Content-Type: application/json

{ "username": "tara", "password": "…" }
```

| Field | Rule |
|---|---|
| `username` | Required. A string of 1 to 64 characters. |
| `password` | Required. A string of 1 to 256 characters. |

The body must be a JSON object; anything else is `validation` with `pointer` `""`.

**A wrong password and an unknown username get the same response**: the same status, the same `type` and
the same `detail`, so the response does not tell whether an account exists. The server takes about the
same time for both.

### Order of checks

1. Body size (16 KiB) → `413 body-too-large`.
2. JSON syntax → `400 invalid-json`.
3. Field rules → `400 validation` (every broken field).
4. Username and password → `401 unauthenticated`.
5. `200`.

## 4. Success — `200 OK`

```
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{ "token": "3f9c…", "user": { "id": 2001, "name": "Tara", "role": "ta" } }
```

| Field | Meaning |
|---|---|
| `token` | Send it as `Authorization: Bearer <token>`. |
| `user.role` | `admin`, `ta` or `student`. A client may use it to choose screens; the server checks every request itself. |

Each sign-in issues a **new** token; the user's earlier token stops working.

## 5. Change policy

As in `post-lab-submissions.md` §7.
