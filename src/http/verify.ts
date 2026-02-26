/**
 * Ed25519 signature verification for Discord HTTP interactions.
 *
 * Uses Node.js native `crypto.subtle` — no external dependencies.
 */

import { webcrypto } from 'node:crypto';

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Verify an incoming Discord interaction signature.
 *
 * @param rawBody  - Raw request body string
 * @param signature - Value of X-Signature-Ed25519 header
 * @param timestamp - Value of X-Signature-Timestamp header
 * @param publicKey - Discord application public key (hex)
 * @returns true if the signature is valid
 */
export async function verifyDiscordSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKey: string
): Promise<boolean> {
  try {
    const keyBytes = hexToUint8Array(publicKey);
    const key = await webcrypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );

    const signatureBytes = hexToUint8Array(signature);
    const messageBytes = new TextEncoder().encode(timestamp + rawBody);

    return await webcrypto.subtle.verify('Ed25519', key, signatureBytes, messageBytes);
  } catch {
    return false;
  }
}
