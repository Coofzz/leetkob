import { createApp } from './app.ts';
import { openDb } from './db.ts';

const port = Number(process.env.PORT) || 3000;
createApp(openDb()).listen(port, () => {
  console.warn(`LeeTKOB API listening on http://localhost:${port}`);
});
