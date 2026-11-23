// The constraint review of one submission: hard rules first, then the model for what is left.
// This is the ReviewFn the worker calls and the checker command runs (docs/decisions/pa3-architecture.md §5–8).
import type { ConstraintResult, ReviewFn, ReviewInput } from '../types.ts';
import { decideBanList } from './hard-rules.ts';

/** Decides semantic constraints with the model, behind its schema check and timeout. */
export type SemanticReview = (
  input: ReviewInput,
  info?: { skippedByHardRules?: string[] },
) => Promise<ConstraintResult[]>;

const unsure = (constraint: string, unsureReason: ConstraintResult['unsureReason']): ConstraintResult => ({
  constraint,
  verdict: 'unsure',
  evidence: [],
  source: 'model',
  unsureReason,
});

export function createReview(semantic?: SemanticReview): ReviewFn {
  return async (input, { modelOff }) => {
    const decided = new Map<string, ConstraintResult>();
    const forModel: ReviewInput['constraints'] = [];
    for (const c of input.constraints) {
      const d = decideBanList(c.text, input.source);
      if (d)
        decided.set(c.id, {
          constraint: c.id,
          verdict: d.verdict,
          evidence: d.evidence,
          source: 'hard-rule',
        });
      else forModel.push(c); // the model is never asked about a constraint a hard rule decided
    }

    if (forModel.length > 0) {
      if (modelOff) {
        for (const c of forModel) decided.set(c.id, unsure(c.id, 'model-off'));
      } else {
        if (!semantic) throw new Error('no model client is configured; run with MODEL_OFF=1');
        const answers = await semantic(
          { ...input, constraints: forModel },
          { skippedByHardRules: [...decided.keys()] },
        );
        for (const c of forModel) {
          decided.set(c.id, answers.find((a) => a.constraint === c.id) ?? unsure(c.id, 'schema'));
        }
      }
    }
    return input.constraints.map((c) => decided.get(c.id) ?? unsure(c.id, 'schema'));
  };
}
