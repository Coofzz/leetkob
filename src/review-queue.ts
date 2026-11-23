// GET /labs/{labId}/review-queue — implements docs/contract/get-lab-review-queue.md.
// The only place constraint verdicts go: a TA of the class (or an admin) reviews them here. Nothing in
// PA#3 turns a verdict into a mark.
import type { DatabaseSync } from 'node:sqlite';
import { Router, type Request, type Response } from 'express';
import { bearer, type Caller } from './auth.ts';
import { sendProblem } from './problem.ts';

interface VerdictRow {
  submission_id: number;
  student_id: number;
  student_name: string;
  constraint_id: string;
  text: string;
  deduction: number;
  verdict: 'pass' | 'violation' | 'unsure';
  source: string;
  evidence_json: string;
  unsure_reason: string | null;
  reason: string | null;
  sample_rank: number;
  position: number;
}

// "Counted": each student's latest submission to the lab (FAQ-02).
const COUNTED = `
  SELECT s.id, s.student_id, s.status FROM submissions s
   WHERE s.lab_id = ?
     AND s.id = (SELECT MAX(s2.id) FROM submissions s2 WHERE s2.lab_id = s.lab_id AND s2.student_id = s.student_id)`;

export function reviewQueueRouter(db: DatabaseSync) {
  const q = {
    lab: db.prepare('SELECT id, class_id FROM labs WHERE id = ?'),
    member: db.prepare('SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ?'),
    // A random rank below 1e9: node:sqlite cannot read integers past 2^53 as numbers.
    rankMissing: db.prepare(
      `UPDATE constraint_verdicts SET sample_rank = abs(random() % 1000000000)
        WHERE sample_rank IS NULL AND submission_id IN (SELECT id FROM submissions WHERE lab_id = ?)`,
    ),
    counted: db.prepare(
      `SELECT c.id, c.status,
              EXISTS (SELECT 1 FROM constraint_verdicts v WHERE v.submission_id = c.id) AS reviewed
         FROM (${COUNTED}) c`,
    ),
    constraintCount: db.prepare('SELECT COUNT(*) AS n FROM lab_constraints WHERE lab_id = ?'),
    verdicts: db.prepare(
      `SELECT v.submission_id, c.student_id, u.name AS student_name, v.constraint_id, k.text, k.deduction,
              v.verdict, v.source, v.evidence_json, v.unsure_reason, v.reason, v.sample_rank, k.position
         FROM (${COUNTED}) c
         JOIN constraint_verdicts v ON v.submission_id = c.id
         JOIN lab_constraints k ON k.lab_id = ? AND k.constraint_id = v.constraint_id
         JOIN users u ON u.id = c.student_id
        ORDER BY v.submission_id, k.position`,
    ),
  };

  function show(req: Request, res: Response) {
    const raw = String(req.params.labId);
    const id = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
    const caller = res.locals.caller as Caller;
    const lab = id ? (q.lab.get(id) as { id: number; class_id: number } | undefined) : undefined;
    const inClass = lab !== undefined && q.member.get(lab.class_id, caller.id) !== undefined;
    // §3: a student of the class knows the lab exists, so 403; anyone outside the class gets the 404 of a
    // missing lab.
    if (!lab || (caller.role !== 'admin' && !inClass)) {
      return sendProblem(res, 'not-found', `Lab ${raw} does not exist.`);
    }
    if (caller.role === 'student') {
      return sendProblem(res, 'forbidden', 'Students cannot see the review queue.');
    }

    q.rankMissing.run(lab.id);
    const counted = q.counted.all(lab.id) as { id: number; status: string; reviewed: number }[];
    const hasConstraints = Number((q.constraintCount.get(lab.id) as { n: number }).n) > 0;
    const pending = counted.filter(
      (c) =>
        c.status === 'queued' ||
        c.status === 'judging' ||
        (c.status === 'accepted' && hasConstraints && !c.reviewed),
    ).length;

    const rows = q.verdicts.all(lab.id, lab.id) as unknown as VerdictRow[];
    const passes = rows.filter((r) => r.verdict === 'pass');
    const sampleSize = Math.ceil(passes.length / 10); // FAQ-10: ceil(10%), so one pass gives one sample
    const sample = [...passes].sort((a, b) => a.sample_rank - b.sample_rank).slice(0, sampleSize);
    const order = { violation: 0, unsure: 1, pass: 2 } as const;
    const items = [...rows.filter((r) => r.verdict !== 'pass'), ...sample]
      .sort(
        (a, b) =>
          order[a.verdict] - order[b.verdict] || a.submission_id - b.submission_id || a.position - b.position,
      )
      .map((r) => ({
        submissionId: r.submission_id,
        studentId: r.student_id,
        studentName: r.student_name,
        constraint: r.constraint_id,
        text: r.text,
        deduction: r.deduction,
        verdict: r.verdict,
        source: r.source,
        evidence: JSON.parse(r.evidence_json) as unknown,
        unsureReason: r.unsure_reason ?? null,
        reason: r.reason ?? null,
        inSample: r.verdict === 'pass',
      }));

    res.json({
      labId: lab.id,
      countedSubmissions: counted.length,
      pendingSubmissions: pending,
      passVerdicts: passes.length,
      sampledPass: sample.length,
      items,
    });
  }

  const router = Router();
  router.get('/labs/:labId/review-queue', bearer(db), show);
  return router;
}
