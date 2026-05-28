import type { SelectorAnchor } from '../selectors/resilientSelector';
import { anchorKey } from '../selectors/resilientSelector';
import type { RouteHeatmap, Suggestion } from './types';

export interface SuggestionOptions {
  minSessions?: number;
  minTotalActiveMs?: number;
  minElementVisibilityMs?: number;
  minConfidence?: number;
  maxSuggestions?: number;
}

const DEFAULTS: Required<SuggestionOptions> = {
  minSessions: 3,
  minTotalActiveMs: 30_000,
  minElementVisibilityMs: 5_000,
  minConfidence: 0.5,
  maxSuggestions: 5,
};

export function generateSuggestions(
  heatmap: RouteHeatmap,
  opts: SuggestionOptions = {},
): Suggestion[] {
  const o = { ...DEFAULTS, ...opts };
  if (heatmap.sessions < o.minSessions) return [];
  if (heatmap.totalActiveMs < o.minTotalActiveMs) return [];

  const out: Suggestion[] = [];
  for (const el of heatmap.elements) {
    if (el.interactions > 0) continue;
    if (el.visibilityMs < o.minElementVisibilityMs) continue;

    if (isMainContent(el.anchor)) continue;

    const visibilityRatio = heatmap.totalActiveMs > 0
      ? el.visibilityMs / heatmap.totalActiveMs
      : 0;
    const decorativeBonus = looksDecorative(el.anchor) ? 0.3 : 0;
    const confidence = Math.min(1, visibilityRatio * 1.5 + decorativeBonus);
    if (confidence < o.minConfidence) continue;

    out.push({
      id: `${heatmap.route}::${anchorKey(el.anchor)}`,
      routeKey: heatmap.route,
      anchor: el.anchor,
      reason: `נראית ${Math.round(visibilityRatio * 100)}% מהזמן אך אינך מתקשר איתה`,
      description: describeAnchor(el.anchor),
      action: 'hide',
      confidence,
      stats: {
        visibilityMs: el.visibilityMs,
        interactions: el.interactions,
        sessions: heatmap.sessions,
        visibilityRatio,
      },
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, o.maxSuggestions);
}

function isMainContent(a: SelectorAnchor): boolean {
  if (a.role === 'main') return true;
  if (a.tag === 'main' || a.tag === 'article') return true;
  return false;
}

function looksDecorative(a: SelectorAnchor): boolean {
  if (a.tag === 'aside') return true;
  if (a.role === 'banner' || a.role === 'complementary' || a.role === 'contentinfo') return true;
  const name = (a.accessibleName ?? a.ariaLabel ?? '').toLowerCase();
  if (/\b(ad|advert|sponsor|promo|newsletter|subscribe|cookie)\b/.test(name)) return true;
  return false;
}

export function describeAnchor(a: SelectorAnchor): string {
  if (a.ariaLabel) return `${a.tag} — "${truncate(a.ariaLabel, 50)}"`;
  if (a.accessibleName) return `${a.tag} — "${truncate(a.accessibleName, 50)}"`;
  if (a.role) return `${a.tag} (role: ${a.role})`;
  return a.tag;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
