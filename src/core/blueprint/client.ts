import type { SkeletonNode } from '../skeletonizer/skeletonizer';
import { isBlueprint } from './types';
import type { Blueprint, BlueprintResponse } from './types';

export interface FetchBlueprintArgs {
  serverUrl: string;
  structuralHash: string;
  skeleton: SkeletonNode;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FetchBlueprintResult {
  ok: boolean;
  blueprint?: Blueprint;
  source?: BlueprintResponse['source'];
  error?: string;
}

export async function fetchBlueprint(args: FetchBlueprintArgs): Promise<FetchBlueprintResult> {
  const { serverUrl, structuralHash, skeleton, timeoutMs = 5000 } = args;
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = normalizeUrl(serverUrl);
  if (!url) return { ok: false, error: 'invalid server URL' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url}/blueprint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ structuralHash, skeleton }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `server error ${res.status}` };
    const data = (await res.json()) as Partial<BlueprintResponse>;
    if (!data || typeof data !== 'object') return { ok: false, error: 'invalid response shape' };
    if (!isBlueprint(data.blueprint)) return { ok: false, error: 'invalid blueprint shape' };
    return { ok: true, blueprint: data.blueprint, source: data.source };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'timeout' };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(raw: string): string {
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
