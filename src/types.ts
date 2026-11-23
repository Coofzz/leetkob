// Module boundaries for PA#3 (see docs/decisions/pa3-architecture.md).
// The worker only talks to the sandbox through JudgeFn and to the checker through ReviewFn,
// so each side can be tested with a fake of the other (test/helpers/fakes.ts).

export type Verdict = 'pass' | 'violation' | 'unsure';
export type UnsureReason = 'model-off' | 'schema' | 'timeout' | 'evidence-mismatch' | 'model-error';
export interface Evidence {
  line: number;
  text: string;
}

// B2: compile and run inside the sandbox
export interface JudgeInput {
  jobId: string;
  source: string;
  tests: { input: string; expected: string }[];
  cpuMs: number;
  memoryMb: number;
}
export interface JudgeResult {
  status:
    | 'accepted'
    | 'compile_error'
    | 'wrong_answer'
    | 'time_limit'
    | 'memory_limit'
    | 'runtime_error'
    | 'output_limit';
  compileStderr?: string;
  tests: { idx: number; verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'OLE'; timeMs: number }[];
}
export type JudgeFn = (input: JudgeInput) => Promise<JudgeResult>;

// B4–B6: hard rules first, then the model, with schema validation and a timeout
export interface ReviewInput {
  statement: string;
  constraints: { id: string; text: string }[]; // never the deduction: the TA owns it
  source: string;
}
export interface ConstraintResult {
  constraint: string;
  verdict: Verdict;
  evidence: Evidence[];
  source: 'hard-rule' | 'model';
  unsureReason?: UnsureReason;
}
export type ReviewFn = (input: ReviewInput, opts: { modelOff: boolean }) => Promise<ConstraintResult[]>;
