import { describe, it, expect } from 'vitest';
import { encryptJson, decryptJson, randomDeviceId } from './crypto';
import { uploadUxDna, downloadUxDna } from './sync';
import type { UxDna } from '../storage/types';

const SAMPLE_DNA: UxDna = {
  enabled: true,
  typography: { enabled: true, fontScale: 1.2, lineHeight: 1.6 },
  spacing: { enabled: false, density: 'normal' },
  contrast: { enabled: true, mode: 'dark', boost: 0 },
  declutter: { enabled: true, hideAds: true, hideStickyBars: true, hideCookieBanners: true },
  focusMode: { enabled: false, dimLevel: 0.4 },
  motion: { enabled: false, reduce: true },
  dyslexiaFont: { enabled: false },
  blueprint: { enabled: false, serverUrl: '', apiKey: '' },
  sync: { enabled: true, serverUrl: 'http://localhost:8000', deviceId: 'dev_test', passphraseSet: true },
  autonomy: { enabled: true, confidenceThreshold: 0.7, observationVisits: 3 },
};

describe('crypto round-trip', () => {
  it('encrypts and decrypts JSON with the right passphrase', async () => {
    const ct = await encryptJson('hunter2', JSON.stringify({ hello: 'world' }));
    const pt = await decryptJson('hunter2', ct);
    expect(JSON.parse(pt)).toEqual({ hello: 'world' });
  });

  it('fails to decrypt with the wrong passphrase', async () => {
    const ct = await encryptJson('correct', 'sensitive');
    await expect(decryptJson('wrong-password', ct)).rejects.toBeDefined();
  });

  it('randomDeviceId returns a 36-char ish stable form', () => {
    const a = randomDeviceId();
    const b = randomDeviceId();
    expect(a).not.toBe(b);
    expect(a.startsWith('dev_')).toBe(true);
  });
});

describe('uploadUxDna / downloadUxDna', () => {
  it('rejects an invalid server URL', async () => {
    const r = await uploadUxDna({
      serverUrl: 'ftp://nope',
      passphrase: 'p',
      deviceId: 'd',
      uxDna: SAMPLE_DNA,
    });
    expect(r.ok).toBe(false);
  });

  it('uploads encrypted payload (server never sees plaintext)', async () => {
    let observedBody: any = null;
    const fakeFetch = (async (url: any, init: any) => {
      observedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await uploadUxDna({
      serverUrl: 'http://localhost:8000',
      passphrase: 'secret',
      deviceId: 'dev_x',
      uxDna: SAMPLE_DNA,
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(true);
    expect(observedBody.deviceId).toBe('dev_x');
    expect(observedBody.ciphertext_b64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(JSON.stringify(observedBody)).not.toContain('dark'); // no plaintext leak
    expect(JSON.stringify(observedBody)).not.toContain('lineHeight');
  });

  it('downloads + decrypts with the right passphrase', async () => {
    const encrypted = await encryptJson('p1', JSON.stringify(SAMPLE_DNA));
    const fakeFetch = (async () =>
      new Response(JSON.stringify(encrypted), { status: 200 })) as unknown as typeof fetch;
    const r = await downloadUxDna({
      serverUrl: 'http://localhost:8000',
      passphrase: 'p1',
      deviceId: 'dev_x',
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(true);
    expect(r.uxDna?.contrast.mode).toBe('dark');
  });

  it('reports an error on wrong passphrase', async () => {
    const encrypted = await encryptJson('p1', JSON.stringify(SAMPLE_DNA));
    const fakeFetch = (async () =>
      new Response(JSON.stringify(encrypted), { status: 200 })) as unknown as typeof fetch;
    const r = await downloadUxDna({
      serverUrl: 'http://localhost:8000',
      passphrase: 'wrong',
      deviceId: 'dev_x',
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/decryption|passphrase/i);
  });

  it('returns 404 cleanly when no record exists', async () => {
    const fakeFetch = (async () =>
      new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const r = await downloadUxDna({
      serverUrl: 'http://localhost:8000',
      passphrase: 'p',
      deviceId: 'dev_missing',
      fetchImpl: fakeFetch,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no remote/i);
  });
});
