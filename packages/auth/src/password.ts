import * as argon2 from 'argon2';

/** CLAUDE.md "Auth": argon2 password hashing. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
