import express, { type NextFunction, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { INTERNAL_DETAIL, sendProblem } from './problem.ts';

export function createApp(db: DatabaseSync) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb', type: ['application/json', 'application/*+json'] }));

  app.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true });
  });

  // Endpoints are mounted here (PA#2: POST /labs/:labId/submissions).

  app.use((req: Request, res: Response) => {
    sendProblem(res, 'not-found', `No endpoint for ${req.method} ${req.path}`);
  });

  // Errors: body-parser's malformed JSON is the client's fault; anything else is ours.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof SyntaxError && 'body' in err) {
      return sendProblem(res, 'invalid-json', 'The request body is not valid JSON.');
    }
    console.error(err); // the stack goes to the log, never to the client
    sendProblem(res, 'internal', INTERNAL_DETAIL);
  });

  return app;
}
