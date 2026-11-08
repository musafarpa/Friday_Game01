/**
 * Cryptographic helpers for Friday Fun 2026.
 * Generates secure unguessable tokens and creates SHA-256 hashes
 * using the standard Web Crypto API.
 */

export function generateSecureToken(byteLength: number = 24): string {
  const randomBytes = new Uint8Array(byteLength);
  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : (window as any).crypto;
  cryptoObj.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token.trim());
  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : (window as any).crypto;
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

