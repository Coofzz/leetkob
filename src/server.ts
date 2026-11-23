import { createApp } from './app.ts';
import { openDb } from './db.ts';

const port = Number(process.env.PORT) || 3000;
// On the deployment HOST=127.0.0.1: only Caddy, on the same machine, reaches the API (docs/deploy.md).
const host = process.env.HOST || '0.0.0.0';
createApp(openDb()).listen(port, host, () => {
  console.warn(`LeeTKOB API listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});
