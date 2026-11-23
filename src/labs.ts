// POST /classes/{classId}/labs — implements docs/contract/post-class-labs.md.
// Section numbers refer to that file. The checks run in the order of §4.
import type { DatabaseSync } from 'node:sqlite';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { bearer, bodyTooLarge, type Caller } from './auth.ts';
import { sendProblem, type FieldError } from './problem.ts';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const CONSTRAINT_ID = /^[A-Za-z0-9_-]{1,16}$/;

interface LabBody {
  title: string;
  statement: string;
  deadlineAt: string;
  limits: { cpuMs: number; memoryMb: number };
  tests: { input: string; output: string }[];
  constraints: { id: string; text: string; deduction: number }[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max;
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** §4 field rules. Returns every broken field, or the normalised lab. */
export function checkLab(body: unknown, now: Date): { errors: FieldError[] } | { lab: LabBody } {
  const errors: FieldError[] = [];
  const err = (pointer: string, detail: string) => errors.push({ pointer, detail });
  if (!isObject(body)) return { errors: [{ pointer: '', detail: 'must be a JSON object' }] };

  if (!isText(body.title, 1, 200)) err('/title', 'must be a string of 1 to 200 characters');
  if (!isText(body.statement, 1, 65_536)) err('/statement', 'must be a string of 1 to 65 536 characters');

  let deadlineAt = '';
  if (
    typeof body.deadlineAt !== 'string' ||
    !ISO_UTC.test(body.deadlineAt) ||
    isNaN(Date.parse(body.deadlineAt))
  ) {
    err('/deadlineAt', 'must be an ISO 8601 time in UTC ending in Z');
  } else if (Date.parse(body.deadlineAt) <= now.getTime()) {
    err('/deadlineAt', 'must be later than now');
  } else {
    deadlineAt = new Date(body.deadlineAt).toISOString();
  }

  const limits = { cpuMs: 1000, memoryMb: 256 }; // FAQ-05 defaults
  if (body.limits !== undefined) {
    if (!isObject(body.limits)) err('/limits', 'must be an object');
    else {
      const { cpuMs, memoryMb } = body.limits;
      if (cpuMs !== undefined) {
        if (isIntIn(cpuMs, 1000, 5000)) limits.cpuMs = cpuMs;
        else err('/limits/cpuMs', 'must be an integer from 1000 to 5000');
      }
      if (memoryMb !== undefined) {
        if (isIntIn(memoryMb, 64, 512)) limits.memoryMb = memoryMb;
        else err('/limits/memoryMb', 'must be an integer from 64 to 512');
      }
    }
  }

  if (!Array.isArray(body.tests) || body.tests.length < 1 || body.tests.length > 100) {
    err('/tests', 'must be an array of 1 to 100 tests');
  } else {
    body.tests.forEach((t: unknown, i: number) => {
      if (!isObject(t)) return err(`/tests/${i}`, 'must be an object with input and output');
      if (typeof t.input !== 'string') err(`/tests/${i}/input`, 'must be a string');
      if (typeof t.output !== 'string') err(`/tests/${i}/output`, 'must be a string');
    });
  }

  const constraints = body.constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 20) {
    err('/constraints', 'must be an array of at most 20 constraints');
  } else {
    const seen = new Set<string>();
    constraints.forEach((c: unknown, i: number) => {
      if (!isObject(c)) return err(`/constraints/${i}`, 'must be an object with id, text and deduction');
      if (typeof c.id !== 'string' || !CONSTRAINT_ID.test(c.id)) {
        err(`/constraints/${i}/id`, 'must be 1 to 16 characters of A-Z a-z 0-9 _ -');
      } else if (seen.has(c.id)) {
        err(`/constraints/${i}/id`, `repeats ${c.id}; ids must be unique in the lab`);
      } else seen.add(c.id);
      if (!isText(c.text, 1, 2000)) err(`/constraints/${i}/text`, 'must be a string of 1 to 2000 characters');
      if (!isIntIn(c.deduction, 0, 10)) err(`/constraints/${i}/deduction`, 'must be an integer from 0 to 10');
    });
  }

  if (errors.length) return { errors };
  const b = body as unknown as LabBody;
  return {
    lab: {
      title: b.title,
      statement: b.statement,
      deadlineAt,
      limits,
      tests: b.tests.map((t) => ({ input: t.input, output: t.output })),
      constraints: (constraints as LabBody['constraints']).map((c) => ({
        id: c.id,
        text: c.text,
        deduction: c.deduction,
      })),
    },
  };
}

export function labsRouter(db: DatabaseSync) {
  const q = {
    // §3: the class exists and the caller is its TA, or an admin.
    classForCaller: db.prepare(`
      SELECT c.id FROM classes c
       WHERE c.id = ?
         AND (? = 'admin'
              OR (? = 'ta' AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.id AND m.user_id = ?)))`),
    insertLab: db.prepare(`
      INSERT INTO labs (class_id, title, deadline_at, statement, cpu_ms, memory_mb, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    insertTest: db.prepare('INSERT INTO lab_tests (lab_id, idx, input, expected_output) VALUES (?, ?, ?, ?)'),
    insertConstraint: db.prepare(
      'INSERT INTO lab_constraints (lab_id, constraint_id, position, text, deduction) VALUES (?, ?, ?, ?, ?)',
    ),
  };

  // 2. The class exists and the caller may create labs in it. "Not yours" and "does not exist" look the same.
  function loadClass(req: Request, res: Response, next: NextFunction) {
    const raw = String(req.params.classId);
    const id = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
    const caller = res.locals.caller as Caller;
    const found = id ? q.classForCaller.get(id, caller.role, caller.role, caller.id) : undefined;
    if (!found) return sendProblem(res, 'not-found', `Class ${raw} does not exist.`);
    res.locals.classId = id;
    next();
  }

  function create(req: Request, res: Response) {
    // 4. JSON syntax.
    let body: unknown;
    try {
      body = JSON.parse(typeof req.body === 'string' ? req.body : '');
    } catch {
      return sendProblem(res, 'invalid-json', 'The request body is not valid JSON.');
    }
    // 5. Field rules — every broken field.
    const now = new Date();
    const checked = checkLab(body, now);
    if ('errors' in checked) {
      return sendProblem(res, 'validation', `${checked.errors.length} field(s) invalid`, checked.errors);
    }
    const { lab } = checked;
    const classId = res.locals.classId as number;
    const caller = res.locals.caller as Caller;
    const createdAt = now.toISOString();

    // 6. The lab, its tests and its constraints in one transaction.
    db.exec('BEGIN IMMEDIATE');
    let id: number;
    try {
      id = Number(
        q.insertLab.run(
          classId,
          lab.title,
          lab.deadlineAt,
          lab.statement,
          lab.limits.cpuMs,
          lab.limits.memoryMb,
          caller.id,
          createdAt,
        ).lastInsertRowid,
      );
      lab.tests.forEach((t, i) => q.insertTest.run(id, i, t.input, t.output));
      lab.constraints.forEach((c, i) => q.insertConstraint.run(id, c.id, i, c.text, c.deduction));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    res.status(201).location(`/labs/${id}`).json({
      id,
      classId,
      title: lab.title,
      deadlineAt: lab.deadlineAt,
      limits: lab.limits,
      testCount: lab.tests.length,
      constraints: lab.constraints,
      createdAt,
    });
  }

  const router = Router();
  router.post(
    '/classes/:classId/labs',
    bearer(db), // 1.
    loadClass, // 2.
    express.text({ type: () => true, limit: '8mb' }), // 3. read only now, after §3
    bodyTooLarge('The request body is larger than 8 MiB.'),
    create,
  );
  return router;
}
