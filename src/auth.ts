// Sign-in (docs/contract/post-auth-login.md) and the Bearer check the PA#3 routes share.
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { verifyPassword } from './passwords.ts';
import { sendProblem, type FieldError } from './problem.ts';

export interface Caller {
  id: number;
  role: 'admin' | 'ta' | 'student';
}

/** Sets res.locals.caller from `Authorization: Bearer <token>`, or answers 401. */
export function bearer(db: DatabaseSync) {
  const userByToken = db.prepare('SELECT id, role FROM users WHERE token = ?');
  return (req: Request, res: Response, next: NextFunction) => {
    const m = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '');
    const user = m ? (userByToken.get(m[1] as string) as Caller | undefined) : undefined;
    if (!user) {
      res.set('WWW-Authenticate', 'Bearer');
      return sendProblem(res, 'unauthenticated', 'Send Authorization: Bearer <token> with a valid token.');
    }
    res.locals.caller = { id: Number(user.id), role: user.role };
    next();
  };
}

/** For handlers after body-reading middleware: maps body-parser's size error to the given problem. */
export function bodyTooLarge(detail: string) {
  return (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      return sendProblem(res, 'body-too-large', detail);
    }
    next(err);
  };
}

const WRONG = 'The username or the password is wrong.';

export function loginRouter(db: DatabaseSync) {
  const q = {
    byUsername: db.prepare('SELECT id, name, role, password_hash FROM users WHERE username = ?'),
    setToken: db.prepare('UPDATE users SET token = ? WHERE id = ?'),
  };
  const router = Router();
  router.post(
    '/auth/login',
    express.text({ type: () => true, limit: '16kb' }),
    bodyTooLarge('The request body is larger than 16 KiB.'),
    (req: Request, res: Response) => {
      let body: unknown;
      try {
        body = JSON.parse(typeof req.body === 'string' ? req.body : '');
      } catch {
        return sendProblem(res, 'invalid-json', 'The request body is not valid JSON.');
      }
      const errors: FieldError[] = [];
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        errors.push({ pointer: '', detail: 'must be a JSON object' });
      } else {
        const b = body as Record<string, unknown>;
        if (typeof b.username !== 'string' || b.username.length < 1 || b.username.length > 64) {
          errors.push({ pointer: '/username', detail: 'must be a string of 1 to 64 characters' });
        }
        if (typeof b.password !== 'string' || b.password.length < 1 || b.password.length > 256) {
          errors.push({ pointer: '/password', detail: 'must be a string of 1 to 256 characters' });
        }
      }
      if (errors.length) {
        return sendProblem(res, 'validation', `${errors.length} field(s) invalid`, errors);
      }

      const { username, password } = body as { username: string; password: string };
      const user = q.byUsername.get(username) as
        { id: number; name: string; role: string; password_hash: string | null } | undefined;
      // verifyPassword does the same work when there is no such user, so timing does not tell.
      if (!verifyPassword(password, user?.password_hash) || !user) {
        return sendProblem(res, 'unauthenticated', WRONG);
      }
      const token = randomBytes(32).toString('hex');
      q.setToken.run(token, user.id);
      res
        .status(200)
        .set('Cache-Control', 'no-store')
        .json({ token, user: { id: Number(user.id), name: user.name, role: user.role } });
    },
  );
  return router;
}
