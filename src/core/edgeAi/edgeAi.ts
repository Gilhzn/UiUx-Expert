/**
 * Capability-detected bridge to Chrome's built-in Gemini Nano (`window.ai`).
 *
 * Used for best-effort semantic enrichment: e.g., labelling an anchor as
 * "ad", "newsletter", "navigation", etc. so suggestion descriptions read
 * more naturally. Returns null when the API is unavailable so callers
 * can fall back to heuristics — Edge AI is never on the critical path.
 */

import type { SelectorAnchor } from '../selectors/resilientSelector';

type CapabilityState = 'readily' | 'after-download' | 'no';

interface AiTextSession {
  prompt(text: string): Promise<string>;
  destroy?: () => void;
}

interface AiTextSessionFactory {
  canCreateTextSession?: () => Promise<CapabilityState>;
  capabilities?: () => Promise<{ available: CapabilityState }>;
  createTextSession?: () => Promise<AiTextSession>;
  create?: () => Promise<AiTextSession>;
}

interface AiNamespace {
  languageModel?: AiTextSessionFactory;
  assistant?: AiTextSessionFactory;
  canCreateTextSession?: () => Promise<CapabilityState>;
  createTextSession?: () => Promise<AiTextSession>;
}

declare global {
  interface Window {
    ai?: AiNamespace;
  }
}

const KNOWN_LABELS = [
  'ad',
  'newsletter',
  'sponsored',
  'navigation',
  'sidebar',
  'cookie-notice',
  'social-share',
  'comments',
  'related-content',
  'main-content',
  'unknown',
] as const;

export type SemanticLabel = (typeof KNOWN_LABELS)[number];

let cachedAvailable: boolean | null = null;
let cachedSession: AiTextSession | null = null;

export async function isEdgeAiAvailable(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable;
  const factory = resolveFactory();
  if (!factory) {
    cachedAvailable = false;
    return false;
  }
  try {
    const f = factory as AiTextSessionFactory & AiNamespace;
    const check = (f.capabilities ?? f.canCreateTextSession) as
      | (() => Promise<CapabilityState | { available: CapabilityState }>)
      | undefined;
    if (!check) {
      cachedAvailable = false;
      return false;
    }
    const result = await check.call(factory);
    const state: CapabilityState = typeof result === 'string' ? result : result.available;
    cachedAvailable = state === 'readily';
    return cachedAvailable;
  } catch {
    cachedAvailable = false;
    return false;
  }
}

export async function categorizeElement(anchor: SelectorAnchor): Promise<SemanticLabel | null> {
  if (!(await isEdgeAiAvailable())) return null;
  const session = await ensureSession();
  if (!session) return null;
  const prompt = buildCategorizationPrompt(anchor);
  try {
    const raw = await session.prompt(prompt);
    return normalizeLabel(raw);
  } catch {
    return null;
  }
}

export function resetEdgeAiCacheForTests(): void {
  cachedAvailable = null;
  if (cachedSession?.destroy) cachedSession.destroy();
  cachedSession = null;
}

function resolveFactory(): AiTextSessionFactory | AiNamespace | null {
  if (typeof window === 'undefined') return null;
  const ai = window.ai;
  if (!ai) return null;
  return ai.languageModel ?? ai.assistant ?? ai;
}

async function ensureSession(): Promise<AiTextSession | null> {
  if (cachedSession) return cachedSession;
  const factory = resolveFactory();
  if (!factory) return null;
  const create =
    (factory as AiTextSessionFactory).create ??
    (factory as AiTextSessionFactory).createTextSession ??
    (factory as AiNamespace).createTextSession;
  if (!create) return null;
  try {
    cachedSession = await create.call(factory);
    return cachedSession;
  } catch {
    return null;
  }
}

function buildCategorizationPrompt(anchor: SelectorAnchor): string {
  const lines = [
    'Classify a web page element using only these labels:',
    KNOWN_LABELS.join(', ') + '.',
    'Reply with the single best-matching label, lowercase, no punctuation.',
    `tag: ${anchor.tag}`,
    `role: ${anchor.role ?? 'none'}`,
    `accessible-name: ${truncate(anchor.accessibleName ?? '', 60)}`,
    `aria-label: ${truncate(anchor.ariaLabel ?? '', 60)}`,
    `path: ${anchor.structuralPath}`,
  ];
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function normalizeLabel(raw: string): SemanticLabel {
  const cleaned = raw.toLowerCase().trim().split(/\s+|[,;.\n]/)[0] ?? '';
  for (const label of KNOWN_LABELS) {
    if (cleaned === label || cleaned === label.replace(/-/g, '')) return label;
  }
  return 'unknown';
}
