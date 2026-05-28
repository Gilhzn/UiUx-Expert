import type { UxDna } from '../storage/types';
import { decryptJson, encryptJson, type EncryptedPayload } from './crypto';

export interface SyncEndpointArgs {
  serverUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface UploadArgs extends SyncEndpointArgs {
  passphrase: string;
  deviceId: string;
  uxDna: UxDna;
}

export interface UploadResult {
  ok: boolean;
  error?: string;
}

export async function uploadUxDna(args: UploadArgs): Promise<UploadResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = normalize(args.serverUrl);
  if (!url) return { ok: false, error: 'invalid server URL' };
  if (!args.deviceId) return { ok: false, error: 'missing deviceId' };
  if (!args.passphrase) return { ok: false, error: 'missing passphrase' };

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.apiKey) headers['x-api-key'] = args.apiKey;

  let payload: EncryptedPayload;
  try {
    payload = await encryptJson(args.passphrase, JSON.stringify(args.uxDna));
  } catch (e) {
    return { ok: false, error: 'encryption failed: ' + (e instanceof Error ? e.message : String(e)) };
  }
  try {
    const res = await fetchImpl(`${url}/sync/uxdna`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: args.deviceId, version: 1, ...payload }),
    });
    if (!res.ok) return { ok: false, error: `server error ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface DownloadArgs extends SyncEndpointArgs {
  passphrase: string;
  deviceId: string;
}

export interface DownloadResult {
  ok: boolean;
  uxDna?: UxDna;
  error?: string;
}

export async function downloadUxDna(args: DownloadArgs): Promise<DownloadResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = normalize(args.serverUrl);
  if (!url) return { ok: false, error: 'invalid server URL' };
  if (!args.deviceId) return { ok: false, error: 'missing deviceId' };
  if (!args.passphrase) return { ok: false, error: 'missing passphrase' };
  const headers: Record<string, string> = {};
  if (args.apiKey) headers['x-api-key'] = args.apiKey;
  let res: Response;
  try {
    res = await fetchImpl(`${url}/sync/uxdna/${encodeURIComponent(args.deviceId)}`, { headers });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 404) return { ok: false, error: 'no remote record' };
  if (!res.ok) return { ok: false, error: `server error ${res.status}` };
  const body = (await res.json()) as EncryptedPayload;
  try {
    const plaintext = await decryptJson(args.passphrase, body);
    const dna = JSON.parse(plaintext) as UxDna;
    return { ok: true, uxDna: dna };
  } catch (e) {
    return {
      ok: false,
      error:
        'decryption failed (wrong passphrase or corrupt data): ' +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}

function normalize(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}
