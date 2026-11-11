import express, { type NextFunction, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { INTERNAL_DETAIL, sendProblem } from './problem.ts';
import { submissionsRouter } from './submissions.ts';

export function createApp(db: DatabaseSync) {
  const app = express();
  app.disable('x-powered-by');
  // No global body parser: each route reads its body only after it has checked who is calling,
  // so a caller who may not use a route learns nothing from its body rules (contract §3).

  app.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  app.use(submissionsRouter(db));

  app.use((req: Request, res: Response) => {
    sendProblem(res, 'not-found', `No endpoint for ${req.method} ${req.path}`);
  });

  // Anything a route did not handle is our fault.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    console.error(err); // the stack goes to the log, never to the client
    sendProblem(res, 'internal', INTERNAL_DETAIL);
  });

  return app;
}
