// POST /labs/{labId}/submissions — implements docs/contract/post-lab-submissions.md.
// Section numbers in comments refer to that file. The checks run in the order of §4.
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { sendProblem, type FieldError } from './problem.ts';

const MAX_BODY = '256kb';
const MAX_CODE_BYTES = 65_536;
const IN_FLIGHT_STALE_MS = 60_000;
const KEY_RULE = /^[!-~]{1,255}$/; // 1 to 255 visible ASCII characters (§5)

interface Caller {
  id: number;
  role: string;
}
interface Locals {
  caller: Caller;
  labId: number;
  deadlineAt: string;
  key: string;
  inFlightId: number;
}

// §5 "equal as JSON values: key order and whitespace do not matter".
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
const fingerprint = (body: unknown) => createHash('sha256').update(canonical(body)).digest('hex');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function submissionsRouter(db: DatabaseSync) {
  const q = {
    userByToken: db.prepare('SELECT id, role FROM users WHERE token = ?'),
    // A lab the caller may submit to: it exists, and the caller is a student enrolled in its class (§3).
    labForStudent: db.prepare(`
      SELECT l.id, l.deadline_at FROM labs l
        JOIN class_members m ON m.class_id = l.class_id
        JOIN users u ON u.id = m.user_id
       WHERE l.id = ? AND ? IS NOT NULL AND u.role = 'student'`),
    storedKey: db.prepare(
      'SELECT fingerprint, status, location, body FROM idempotency_keys WHERE student_id = ? AND key = ?',
    ),
    storeKey: db.prepare(
      `INSERT INTO idempotency_keys (student_id, key, fingerprint, status, location, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    claim: db.prepare('INSERT INTO idempotency_in_flight (student_id, key, started_at) VALUES (?, ?, ?)'),
    release: db.prepare('DELETE FROM idempotency_in_flight WHERE id = ?'),
    earlierInFlight: db.prepare(
      'SELECT 1 FROM idempotency_in_flight WHERE student_id = ? AND key = ? AND id < ? AND started_at > ? LIMIT 1',
    ),
    insert: db.prepare(
      `INSERT INTO submissions (lab_id, student_id, language, code, code_bytes, status, submitted_at)
       VALUES (?, ?, 'cpp', ?, ?, 'queued', ?)`,
    ),
  };

  const locals = (res: Response) => res.locals as Locals;

  // 1. Authentication.
  function authenticate(req: Request, res: Response, next: NextFunction) {
    const m = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
    const user = m ? (q.userByToken.get(m[1]!) as Caller | undefined) : undefined;
    if (!user) {
      res.set('WWW-Authenticate', 'Bearer');
      return sendProblem(res, 'unauthenticated', 'Send Authorization: Bearer <token> with a valid token.');
    }
    locals(res).caller = user;
    next();
  }

  // 2. The lab exists and the caller may submit to it. "Not yours" and "does not exist" look the same.
  function loadLab(req: Request, res: Response, next: NextFunction) {
    const raw = String(req.params.labId);
    const id = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
    const lab = id
      ? (q.labForStudent.get(id, locals(res).caller.id) as { id: number; deadline_at: string } | undefined)
      : undefined;
    if (!lab) return sendProblem(res, 'not-found', `Lab ${raw} does not exist.`);
    locals(res).labId = lab.id;
    locals(res).deadlineAt = lab.deadline_at;
    next();
  }

  // 3. The key. From here on the request is "being processed" (§5) until its response is sent.
  function claimKey(req: Request, res: Response, next: NextFunction) {
    const key = req.get('idempotency-key');
    if (key === undefined || !KEY_RULE.test(key)) {
      return sendProblem(
        res,
        'idempotency-key-missing',
        'Send an Idempotency-Key header of 1 to 255 visible ASCII characters.',
      );
    }
    const l = locals(res);
    l.key = key;
    l.inFlightId = Number(q.claim.run(l.caller.id, key, Date.now()).lastInsertRowid);
    res.on('close', () => q.release.run(l.inFlightId));
    next();
  }

  // 4. Body size. The body is read as text so that 5. JSON syntax is checked here, in the contract's order.
  const readBody = express.text({ type: () => true, limit: MAX_BODY });
  function bodyErrors(err: unknown, _req: Request, res: Response, next: NextFunction) {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      return sendProblem(res, 'code-too-large', 'The request body is larger than 256 KiB.');
    }
    next(err);
  }

  function create(req: Request, res: Response) {
    const l = locals(res);
    const raw = typeof req.body === 'string' ? req.body : '';

    // 5. JSON syntax.
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return sendProblem(res, 'invalid-json', 'The request body is not valid JSON.');
    }
    const fp = fingerprint(body);

    // 6. A key this student used before: replay, reused, or still in flight.
    const stored = q.storedKey.get(l.caller.id, l.key) as
      { fingerprint: string; status: number; location: string; body: string } | undefined;
    if (stored) {
      if (stored.fingerprint !== fp) {
        return sendProblem(
          res,
          'idempotency-key-reused',
          'This Idempotency-Key was already used with a different body.',
        );
      }
      return res
        .status(stored.status)
        .set({ Location: stored.location, 'Idempotent-Replayed': 'true' })
        .type('application/json')
        .send(stored.body);
    }
    if (q.earlierInFlight.get(l.caller.id, l.key, l.inFlightId, Date.now() - IN_FLIGHT_STALE_MS)) {
      return sendProblem(
        res,
        'idempotency-key-in-flight',
        'A request with this Idempotency-Key is still being processed. Retry shortly.',
      );
    }

    // 7. Field rules — every broken field — then the code length.
    const errors: FieldError[] = [];
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      errors.push({ pointer: '', detail: 'must be a JSON object' });
    } else {
      const b = body as Record<string, unknown>;
      if (b.language !== 'cpp') errors.push({ pointer: '/language', detail: 'must be "cpp"' });
      if (typeof b.code !== 'string' || b.code.length === 0) {
        errors.push({ pointer: '/code', detail: 'must be a non-empty string' });
      }
    }
    if (errors.length) {
      return sendProblem(
        res,
        'validation',
        `${plural(errors.length, 'field is', 'fields are')} invalid`,
        errors,
      );
    }
    const code = (body as { code: string }).code;
    const codeBytes = Buffer.byteLength(code, 'utf8');
    if (codeBytes > MAX_CODE_BYTES) {
      return sendProblem(
        res,
        'code-too-large',
        `code is ${codeBytes} bytes; the limit is ${MAX_CODE_BYTES} bytes in UTF-8.`,
      );
    }

    // 8. Deadline: the server's clock decides, at or before deadlineAt is on time.
    const submittedAt = new Date().toISOString();
    if (submittedAt > l.deadlineAt) {
      return sendProblem(res, 'deadline-passed', `The deadline of this lab was ${l.deadlineAt}.`);
    }

    // 9. Create the submission and store the key in one transaction.
    db.exec('BEGIN IMMEDIATE');
    let location: string;
    let text: string;
    try {
      const id = Number(q.insert.run(l.labId, l.caller.id, code, codeBytes, submittedAt).lastInsertRowid);
      location = `/submissions/${id}`;
      text = JSON.stringify({
        id,
        labId: l.labId,
        studentId: l.caller.id,
        language: 'cpp',
        codeBytes,
        status: 'queued',
        submittedAt,
      });
      q.storeKey.run(l.caller.id, l.key, fp, 201, location, text, submittedAt);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.status(201).set('Location', location).type('application/json').send(text);
  }

  const router = Router();
  router.post('/labs/:labId/submissions', authenticate, loadLab, claimKey, readBody, bodyErrors, create);
  return router;
}
