/**
 * End-to-end encryption helpers for cloud-synced UX DNA.
 *
 * Uses Web Crypto: PBKDF2-SHA256 (200k iterations) → 256-bit AES-GCM key.
 * The passphrase never leaves the browser; the server only sees opaque
 * { salt, iv, ciphertext } triples.
 */

const PBKDF2_ITERATIONS = 200_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedPayload {
  salt_b64: string;
  iv_b64: string;
  ciphertext_b64: string;
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  // Slice produces a fresh ArrayBuffer detached from any SharedArrayBuffer.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!passphrase) throw new Error('empty passphrase');
  const enc = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    asBuffer(enc),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(passphrase: string, plaintext: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(data));
  return {
    salt_b64: bytesToBase64(salt),
    iv_b64: bytesToBase64(iv),
    ciphertext_b64: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function decryptJson(passphrase: string, payload: EncryptedPayload): Promise<string> {
  const salt = base64ToBytes(payload.salt_b64);
  const iv = base64ToBytes(payload.iv_b64);
  const ct = base64ToBytes(payload.ciphertext_b64);
  const key = await deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(ct));
  return new TextDecoder().decode(pt);
}

export function randomDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `dev_${hex}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
