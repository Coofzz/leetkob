// Password hashing with scrypt (node:crypto), no dependency. Stored as scrypt$<salt hex>$<hash hex>.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, KEY_LENGTH).toString('hex')}`;
}

// Compared against when the username does not exist, so both cases take the same time.
const DUMMY = hashPassword(randomBytes(16).toString('hex'));

/** True when `password` matches `stored`. With no stored hash it still does the work, then says false. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const [scheme, saltHex, hashHex] = (stored ?? DUMMY).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected) && stored !== undefined && stored !== null;
}
