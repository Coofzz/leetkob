import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemBody, PROBLEM_BASE } from '../../src/problem.ts';

test('problemBody repeats the HTTP status and builds the type URI', () => {
  assert.deepEqual(problemBody('not-found', 'lab 7 does not exist'), {
    type: `${PROBLEM_BASE}not-found`,
    title: 'Not found',
    status: 404,
    detail: 'lab 7 does not exist',
  });
});

test('problemBody includes errors only when there are some', () => {
  const body = problemBody('validation', '1 field is invalid', [{ pointer: '/code', detail: 'is required' }]);
  assert.equal(body.status, 400);
  assert.deepEqual(body.errors, [{ pointer: '/code', detail: 'is required' }]);
  assert.equal('errors' in problemBody('internal', 'x'), false);
});
