import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for provider secrets stored at rest (e.g. the Twilio auth
 * token). AES-256-GCM with a random 12-byte IV; the stored string is
 * "v1:<iv>:<tag>:<ciphertext>" (all base64). The 32-byte key is derived from the
 * ENCRYPTION_KEY env var (falling back to AUTH_SECRET) via SHA-256, so any-length
 * secret works and rotating the env var invalidates old ciphertext safely.
 *
 * Server-side only (lives in @booking/db, which never reaches the client).
 */

const VERSION = 'v1';

function keyMaterial(): string | null {
  return process.env.ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

/** True when an encryption key is configured (so callers can fail gracefully). */
export function encryptionAvailable(): boolean {
  return keyMaterial() !== null;
}

function deriveKey(): Buffer {
  const material = keyMaterial();
  if (!material) {
    throw new Error('No encryption key configured. Set ENCRYPTION_KEY (or AUTH_SECRET) to store provider secrets.');
  }
  return createHash('sha256').update(material).digest();
}

/** Encrypt a UTF-8 string. Returns the versioned, base64-packed token. */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Decrypt a token produced by encryptSecret. Returns null if it cannot be read. */
export function decryptSecret(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const key = deriveKey();
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const enc = Buffer.from(parts[3]!, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
