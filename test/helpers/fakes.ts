import type { ConstraintResult, JudgeFn, JudgeInput, JudgeResult, ReviewFn } from '../../src/types.ts';

// Stand-ins for the sandbox and the checker, so tests run without Docker or a network.

/** Accepted with every test AC, unless a script says otherwise. */
export function fakeJudge(script?: (input: JudgeInput) => JudgeResult): JudgeFn {
  return async (input) =>
    script
      ? script(input)
      : { status: 'accepted', tests: input.tests.map((_, idx) => ({ idx, verdict: 'AC', timeMs: 0 })) };
}

/** Every constraint unsure, as if the model were switched off and no hard rule applied. */
export const fakeReview: ReviewFn = async (input) =>
  input.constraints.map((c): ConstraintResult => ({
    constraint: c.id,
    verdict: 'unsure',
    evidence: [],
    source: 'model',
    unsureReason: 'model-off',
  }));
