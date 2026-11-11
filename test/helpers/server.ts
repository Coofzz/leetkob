import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.ts';
import { openDb } from '../../src/db.ts';

// One app on a fresh in-memory database, on a random port. Tests talk to it over HTTP only.
export async function startServer() {
  const db = openDb(':memory:');
  const server: Server = createApp(db).listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { db, base, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
