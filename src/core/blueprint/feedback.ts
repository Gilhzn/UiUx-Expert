export interface ReportFeedbackArgs {
  serverUrl: string;
  apiKey?: string;
  structuralHash: string;
  verifierFailed: boolean;
  issues?: string[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ReportFeedbackResult {
  ok: boolean;
  failures?: number;
  quarantined?: boolean;
  threshold?: number;
  error?: string;
}

export async function reportBlueprintFeedback(
  args: ReportFeedbackArgs,
): Promise<ReportFeedbackResult> {
  const { serverUrl, structuralHash, verifierFailed, issues = [], timeoutMs = 5000 } = args;
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = normalizeUrl(serverUrl);
  if (!url) return { ok: false, error: 'invalid server URL' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (args.apiKey) headers['x-api-key'] = args.apiKey;
  try {
    const res = await fetchImpl(`${url}/blueprint/feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ structuralHash, verifierFailed, issues }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `server error ${res.status}` };
    const data = (await res.json()) as {
      failures?: number;
      quarantined?: boolean;
      threshold?: number;
    };
    return {
      ok: true,
      failures: data.failures,
      quarantined: data.quarantined,
      threshold: data.threshold,
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, error: 'timeout' };
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
