import { createHash, randomBytes } from 'node:crypto';

const VERIFIER_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function createCodeVerifier(length = 64): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += VERIFIER_CHARS[bytes[i]! % VERIFIER_CHARS.length];
  }
  return out;
}

export function createOAuthState(length = 32): string {
  return createCodeVerifier(length);
}

export function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
