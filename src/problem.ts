import type { Response } from 'express';

// Every error the API returns is a problem details object (RFC 9457).
// `type` is the contract: clients branch on it, never on `title` or `detail`.
export const PROBLEM_BASE = 'https://leetkob.example/problems/';

export const PROBLEMS = {
  'invalid-json': { status: 400, title: 'Malformed JSON' },
  validation: { status: 400, title: 'Invalid request' },
  unauthenticated: { status: 401, title: 'Authentication required' },
  'not-found': { status: 404, title: 'Not found' },
  'idempotency-key-missing': { status: 400, title: 'Idempotency-Key required' },
  'code-too-large': { status: 413, title: 'Code too large' },
  'idempotency-key-in-flight': { status: 409, title: 'Request in progress' },
  'idempotency-key-reused': { status: 422, title: 'Idempotency-Key reused' },
  'deadline-passed': { status: 422, title: 'Deadline passed' },
  internal: { status: 500, title: 'Internal error' },
} as const satisfies Record<string, { status: number; title: string }>;

export type ProblemType = keyof typeof PROBLEMS;

export interface FieldError {
  pointer?: string;
  parameter?: string;
  detail: string;
}

export function problemBody(type: ProblemType, detail: string, errors?: FieldError[]) {
  const { status, title } = PROBLEMS[type];
  return { type: PROBLEM_BASE + type, title, status, detail, ...(errors ? { errors } : {}) };
}

export function sendProblem(res: Response, type: ProblemType, detail: string, errors?: FieldError[]) {
  const body = problemBody(type, detail, errors);
  res.status(body.status).type('application/problem+json').send(JSON.stringify(body));
}

// The fixed sentence a 500 carries: never a table name, a path, or an exception message.
export const INTERNAL_DETAIL = 'Something went wrong on our side. Please try again later.';
