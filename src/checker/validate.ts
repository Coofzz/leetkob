// The schema check on the model's answer (rubric criterion 5). Hand-written for the one shape the
// prompt asks for (src/checker/prompt.ts):
//   {"verdicts":[{"constraint","verdict":"pass|violation|unsure","evidence":[{"line","text"}],"reason"}]}
// Anything else is never a verdict: the constraint becomes unsure with a reason the TA sees (FAQ-09).
// Each constraint is judged on its own, so one broken entry does not spoil the others.
import type { ConstraintResult, UnsureReason } from '../types.ts';

const TOP_KEYS = ['verdicts'];
const ITEM_KEYS = ['constraint', 'verdict', 'evidence', 'reason'];
const EVIDENCE_KEYS = ['line', 'text'];
const VERDICTS = ['pass', 'violation', 'unsure'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, allowed: string[]) =>
  Object.keys(o).every((k) => allowed.includes(k));

export function unsure(constraint: string, unsureReason: UnsureReason, reason?: string): ConstraintResult {
  return {
    constraint,
    verdict: 'unsure',
    evidence: [],
    source: 'model',
    unsureReason,
    ...(reason ? { reason } : {}),
  };
}

/**
 * @param text           the model's raw answer
 * @param constraintIds  the constraints that were asked, in order
 * @param seenLines      the de-identified lines the model saw (lines[0] is line 1)
 * @param originalLines  the original source lines, which evidence must quote
 */
export function validateAnswer(
  text: string,
  constraintIds: string[],
  seenLines: string[],
  originalLines: string[],
): ConstraintResult[] {
  const allSchema = () => constraintIds.map((id) => unsure(id, 'schema'));
  let answer: unknown;
  try {
    answer = JSON.parse(text);
  } catch {
    return allSchema();
  }
  if (!isObject(answer) || !onlyKeys(answer, TOP_KEYS) || !Array.isArray(answer.verdicts)) return allSchema();

  const items = new Map<string, unknown[]>();
  for (const item of answer.verdicts) {
    const id = isObject(item) && typeof item.constraint === 'string' ? item.constraint : undefined;
    if (id === undefined || !constraintIds.includes(id)) continue; // an unknown constraint is ignored
    items.set(id, [...(items.get(id) ?? []), item]);
  }

  return constraintIds.map((id) => {
    const found = items.get(id) ?? [];
    if (found.length !== 1) return unsure(id, 'schema'); // missing or repeated
    return checkItem(id, found[0] as Record<string, unknown>, seenLines, originalLines);
  });
}

function checkItem(
  id: string,
  item: Record<string, unknown>,
  seenLines: string[],
  originalLines: string[],
): ConstraintResult {
  if (!onlyKeys(item, ITEM_KEYS)) return unsure(id, 'schema'); // e.g. a deduction or a score
  const { verdict, evidence, reason } = item;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict)) return unsure(id, 'schema');
  if (!Array.isArray(evidence) || typeof reason !== 'string') return unsure(id, 'schema');
  for (const e of evidence) {
    if (!isObject(e) || !onlyKeys(e, EVIDENCE_KEYS)) return unsure(id, 'schema');
    if (!Number.isInteger(e.line) || (e.line as number) < 1 || typeof e.text !== 'string') {
      return unsure(id, 'schema');
    }
  }

  if (verdict === 'unsure') return unsure(id, 'model-unsure', reason);
  if (verdict === 'pass') return { constraint: id, verdict: 'pass', evidence: [], source: 'model', reason };

  // A violation needs evidence, and every evidence line must be the line the model was shown.
  if (evidence.length === 0) return unsure(id, 'evidence-mismatch', reason);
  const cited = [];
  for (const e of evidence as { line: number; text: string }[]) {
    const seen = seenLines[e.line - 1];
    const original = originalLines[e.line - 1];
    const quoted = e.text.trim();
    if (seen === undefined || original === undefined) return unsure(id, 'evidence-mismatch', reason);
    if (quoted !== seen.trim() && quoted !== original.trim()) return unsure(id, 'evidence-mismatch', reason);
    cited.push({ line: e.line, text: original });
  }
  return { constraint: id, verdict: 'violation', evidence: cited, source: 'model', reason };
}
