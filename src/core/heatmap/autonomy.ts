import { loadState, addCustomRule } from '../storage/profile';
import type { StoredState } from '../storage/types';
import { isHeatmapStorageKey, loadRouteHeatmap } from './heatmapStorage';
import { generateSuggestions } from './suggestions';
import type { Suggestion } from './types';

const DEBOUNCE_MS = 10_000;
const MIN_TIME_BETWEEN_AUTO_APPLIES_PER_ORIGIN_MS = 60_000;

const lastEvaluatedAt = new Map<string, number>();
const lastAppliedPerOrigin = new Map<string, number>();

export interface AutonomyResult {
  appliedCount: number;
  evaluatedSuggestions: number;
  reason?: string;
}

export async function evaluateAutonomyForRoute(routeKey: string): Promise<AutonomyResult> {
  const last = lastEvaluatedAt.get(routeKey) ?? 0;
  if (Date.now() - last < DEBOUNCE_MS) {
    return { appliedCount: 0, evaluatedSuggestions: 0, reason: 'debounced' };
  }
  lastEvaluatedAt.set(routeKey, Date.now());

  const state = await loadState();
  if (!state.uxDna.autonomy.enabled) {
    return { appliedCount: 0, evaluatedSuggestions: 0, reason: 'autonomy off' };
  }

  let origin: string;
  try {
    origin = new URL(routeKey).origin;
  } catch {
    return { appliedCount: 0, evaluatedSuggestions: 0, reason: 'bad route key' };
  }

  if (state.sites[origin]?.enabled === false) {
    return { appliedCount: 0, evaluatedSuggestions: 0, reason: 'site disabled' };
  }

  const sinceLast = Date.now() - (lastAppliedPerOrigin.get(origin) ?? 0);
  if (sinceLast < MIN_TIME_BETWEEN_AUTO_APPLIES_PER_ORIGIN_MS) {
    return { appliedCount: 0, evaluatedSuggestions: 0, reason: 'cool-down' };
  }

  const heatmap = await loadRouteHeatmap(routeKey);
  if (!heatmap) {
    return { appliedCount: 0, evaluatedSuggestions: 0, reason: 'no heatmap' };
  }

  const suggestions = generateSuggestions(heatmap, {
    minSessions: state.uxDna.autonomy.observationVisits,
    minConfidence: state.uxDna.autonomy.confidenceThreshold,
  });

  return promoteSuggestions(state, origin, suggestions);
}

async function promoteSuggestions(
  state: StoredState,
  origin: string,
  suggestions: Suggestion[],
): Promise<AutonomyResult> {
  const site = state.sites[origin];
  const dismissed = new Set(site?.dismissedSuggestionIds ?? []);
  const existing = site?.customRules ?? [];
  let applied = 0;
  for (const suggestion of suggestions) {
    if (dismissed.has(suggestion.id)) continue;
    if (
      existing.some(
        (r) =>
          r.anchor.tag === suggestion.anchor.tag &&
          r.anchor.structuralPath === suggestion.anchor.structuralPath,
      )
    ) {
      continue;
    }
    await addCustomRule(origin, suggestion.anchor, 'suggestion');
    applied += 1;
  }
  if (applied > 0) lastAppliedPerOrigin.set(origin, Date.now());
  return { appliedCount: applied, evaluatedSuggestions: suggestions.length };
}

export function registerAutonomyListener(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(changes)) {
      if (!isHeatmapStorageKey(key)) continue;
      const routeKey = key.slice('heatmap:'.length);
      void evaluateAutonomyForRoute(routeKey);
    }
  });
}

export function _resetForTests(): void {
  lastEvaluatedAt.clear();
  lastAppliedPerOrigin.clear();
}
