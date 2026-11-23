// GET /labs and GET /labs/{labId} — implements docs/contract/get-labs.md.
// Students see a lab's constraints and deductions (FAQ-06); nobody gets the tests here (FAQ-02).
import type { DatabaseSync } from 'node:sqlite';
import { Router, type Request, type Response } from 'express';
import { bearer, type Caller } from './auth.ts';
import { sendProblem } from './problem.ts';

const shownStatus = (s: string) => (s === 'output_limit' ? 'runtime_error' : s); // FAQ-05

export function labsReadRouter(db: DatabaseSync) {
  const q = {
    mine: db.prepare(
      `SELECT l.id, l.class_id, c.name AS class_name, l.title, l.deadline_at
         FROM labs l JOIN classes c ON c.id = l.class_id
        WHERE ? = 'admin' OR EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = l.class_id AND m.user_id = ?)
        ORDER BY l.deadline_at, l.id`,
    ),
    lab: db.prepare(
      'SELECT id, class_id, title, statement, deadline_at, cpu_ms, memory_mb FROM labs WHERE id = ?',
    ),
    member: db.prepare('SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ?'),
    testCount: db.prepare('SELECT COUNT(*) AS n FROM lab_tests WHERE lab_id = ?'),
    constraints: db.prepare(
      'SELECT constraint_id, text, deduction FROM lab_constraints WHERE lab_id = ? ORDER BY position',
    ),
    mySubmissions: db.prepare(
      'SELECT id, status, submitted_at FROM submissions WHERE lab_id = ? AND student_id = ? ORDER BY id DESC',
    ),
  };

  function list(_req: Request, res: Response) {
    const caller = res.locals.caller as Caller;
    const labs = q.mine.all(caller.role, caller.id).map((l) => ({
      id: l.id,
      classId: l.class_id,
      className: l.class_name,
      title: l.title,
      deadlineAt: l.deadline_at,
    }));
    res.json({ labs });
  }

  function show(req: Request, res: Response) {
    const raw = String(req.params.labId);
    const id = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
    const caller = res.locals.caller as Caller;
    const lab = id
      ? (q.lab.get(id) as
          | {
              id: number;
              class_id: number;
              title: string;
              statement: string;
              deadline_at: string;
              cpu_ms: number;
              memory_mb: number;
            }
          | undefined)
      : undefined;
    if (!lab || (caller.role !== 'admin' && !q.member.get(lab.class_id, caller.id))) {
      return sendProblem(res, 'not-found', `Lab ${raw} does not exist.`);
    }
    const body: Record<string, unknown> = {
      id: lab.id,
      classId: lab.class_id,
      title: lab.title,
      statement: lab.statement,
      deadlineAt: lab.deadline_at,
      limits: { cpuMs: lab.cpu_ms, memoryMb: lab.memory_mb },
      testCount: Number((q.testCount.get(lab.id) as { n: number }).n),
      constraints: q.constraints.all(lab.id).map((c) => ({
        id: c.constraint_id,
        text: c.text,
        deduction: c.deduction,
      })),
    };
    if (caller.role === 'student') {
      body.mySubmissions = q.mySubmissions.all(lab.id, caller.id).map((s) => ({
        id: s.id,
        status: shownStatus(String(s.status)),
        submittedAt: s.submitted_at,
      }));
    }
    res.json(body);
  }

  const router = Router();
  router.get('/labs', bearer(db), list);
  router.get('/labs/:labId', bearer(db), show);
  return router;
}
