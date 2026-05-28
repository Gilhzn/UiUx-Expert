import { describe, it, expect, vi } from 'vitest';
import { fetchBlueprint } from './client';
import type { SkeletonNode } from '../skeletonizer/skeletonizer';

const skel: SkeletonNode = { t: 'body' };

function mockFetch(handler: (req: { url: string; init: RequestInit }) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler({ url, init: init ?? {} });
  });
}

describe('fetchBlueprint', () => {
  it('rejects an empty server URL', async () => {
    const result = await fetchBlueprint({
      serverUrl: '',
      structuralHash: 'h',
      skeleton: skel,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it('rejects non-http(s) URLs', async () => {
    const result = await fetchBlueprint({
      serverUrl: 'ftp://example.com',
      structuralHash: 'h',
      skeleton: skel,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
  });

  it('returns a parsed blueprint on a valid response', async () => {
    const blueprint = {
      version: 1,
      structuralHash: 'h',
      transforms: [
        {
          id: 't1',
          action: 'hide',
          anchor: {
            tag: 'aside',
            role: null,
            ariaLabel: null,
            accessibleName: null,
            classFingerprint: '',
            structuralPath: 'body>aside:nth-child(2)',
          },
        },
      ],
      metadata: { createdAt: 1, source: 'heuristic' },
    };
    const fetchImpl = mockFetch(async () => new Response(
      JSON.stringify({ blueprint, source: 'heuristic' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const result = await fetchBlueprint({
      serverUrl: 'http://localhost:8000',
      structuralHash: 'h',
      skeleton: skel,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.blueprint?.transforms[0]?.action).toBe('hide');
    expect(result.source).toBe('heuristic');
  });

  it('rejects malformed blueprint payloads', async () => {
    const fetchImpl = mockFetch(async () => new Response(
      JSON.stringify({ blueprint: { version: 1, structuralHash: 'h', transforms: [{ id: 't', action: 'explode' }] } }),
      { status: 200 },
    ));
    const result = await fetchBlueprint({
      serverUrl: 'http://localhost:8000',
      structuralHash: 'h',
      skeleton: skel,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid blueprint/i);
  });

  it('surfaces a non-2xx response as an error', async () => {
    const fetchImpl = mockFetch(async () => new Response('boom', { status: 500 }));
    const result = await fetchBlueprint({
      serverUrl: 'http://localhost:8000',
      structuralHash: 'h',
      skeleton: skel,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it('times out if the server is slow', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const result = await fetchBlueprint({
      serverUrl: 'http://localhost:8000',
      structuralHash: 'h',
      skeleton: skel,
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout');
  });
});
