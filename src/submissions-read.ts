// GET /submissions/{id} — implements docs/contract/get-submission.md.
// A student sees the judge's verdicts but never a test's input or output (FAQ-02) and never a
// constraint verdict (FAQ-08): the `review` field is built only for a TA of the class or an admin.
import type { DatabaseSync } from 'node:sqlite';
import { Router, type Request, type Response } from 'express';
import { bearer, type Caller } from './auth.ts';
import { sendProblem } from './problem.ts';

// FAQ-05: output over the limit is shown as a runtime error.
const shownStatus = (s: string) => (s === 'output_limit' ? 'runtime_error' : s);
const shownVerdict = (v: string) => (v === 'OLE' ? 'RE' : v);

interface Row {
  id: number;
  lab_id: number;
  student_id: number;
  language: string;
  code: string;
  code_bytes: number;
  status: string;
  submitted_at: string;
  class_id: number;
}

export function submissionsReadRouter(db: DatabaseSync) {
  const q = {
    submission: db.prepare(
      `SELECT s.id, s.lab_id, s.student_id, s.language, s.code, s.code_bytes, s.status, s.submitted_at, l.class_id
         FROM submissions s JOIN labs l ON l.id = s.lab_id WHERE s.id = ?`,
    ),
    teaches: db.prepare('SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ?'),
    result: db.prepare(
      'SELECT status, compile_stderr, tests_json FROM judge_results WHERE submission_id = ?',
    ),
    verdicts: db.prepare(
      `SELECT v.constraint_id, c.text, c.deduction, v.verdict, v.source, v.evidence_json, v.unsure_reason, v.reason
         FROM constraint_verdicts v
         JOIN submissions s ON s.id = v.submission_id
         JOIN lab_constraints c ON c.lab_id = s.lab_id AND c.constraint_id = v.constraint_id
        WHERE v.submission_id = ? ORDER BY c.position`,
    ),
    newer: db.prepare('SELECT 1 FROM submissions WHERE lab_id = ? AND student_id = ? AND id > ? LIMIT 1'),
  };

  function show(req: Request, res: Response) {
    const raw = String(req.params.id);
    const id = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
    const caller = res.locals.caller as Caller;
    const row = id ? (q.submission.get(id) as Row | undefined) : undefined;
    const staff =
      row !== undefined &&
      (caller.role === 'admin' ||
        (caller.role === 'ta' && q.teaches.get(row.class_id, caller.id) !== undefined));
    const owner = row !== undefined && caller.role === 'student' && Number(row.student_id) === caller.id;
    // §3: "not yours" and "does not exist" look the same.
    if (!row || (!staff && !owner)) return sendProblem(res, 'not-found', `Submission ${raw} does not exist.`);

    const judged = q.result.get(row.id) as
      { status: string; compile_stderr: string | null; tests_json: string } | undefined;
    const result = judged
      ? {
          status: shownStatus(judged.status),
          tests: (JSON.parse(judged.tests_json) as { idx: number; verdict: string; timeMs: number }[]).map(
            (t) => ({
              idx: t.idx,
              verdict: shownVerdict(t.verdict),
              timeMs: t.timeMs,
            }),
          ),
          ...(judged.status === 'compile_error' ? { compileError: judged.compile_stderr ?? '' } : {}),
        }
      : null;

    const body: Record<string, unknown> = {
      id: row.id,
      labId: row.lab_id,
      studentId: row.student_id,
      language: row.language,
      codeBytes: row.code_bytes,
      code: row.code,
      submittedAt: row.submitted_at,
      status: shownStatus(row.status),
      result,
    };

    if (staff) {
      const verdicts = q.verdicts.all(row.id).map((v) => ({
        constraint: v.constraint_id,
        text: v.text,
        deduction: v.deduction,
        verdict: v.verdict,
        source: v.source,
        evidence: JSON.parse(String(v.evidence_json)) as unknown,
        unsureReason: v.unsure_reason ?? null,
        reason: v.reason ?? null,
      }));
      const inProgress = row.status === 'queued' || row.status === 'judging';
      const latest = !q.newer.get(row.lab_id, row.student_id, row.id);
      const state =
        verdicts.length > 0
          ? 'done'
          : inProgress || (row.status === 'accepted' && latest)
            ? 'pending'
            : 'not-reviewed';
      body.review = { state, verdicts };
    }
    res.json(body);
  }

  const router = Router();
  router.get('/submissions/:id', bearer(db), show);
  return router;
}
