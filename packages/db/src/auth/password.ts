import bcrypt from 'bcryptjs';

/**
 * Password hashing via bcryptjs — pure-JS, no native build step, so it runs on
 * any client host (including shared hosting) per the cost/hosting policy.
 */
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
