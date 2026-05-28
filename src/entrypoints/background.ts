import {
  loadState,
  updateUxDna,
  updateSiteOverride,
  resolveSettings,
  addCustomRule,
  removeCustomRule,
  dismissSuggestion,
} from '../core/storage/profile';
import { routeKeyFromUrl } from '../core/heatmap/routeKey';
import { loadRouteHeatmap } from '../core/heatmap/heatmapStorage';
import { generateSuggestions } from '../core/heatmap/suggestions';
import type { Message } from '../core/storage/types';
import type { Suggestion } from '../core/heatmap/types';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    handle(msg)
      .then(sendResponse)
      .catch((e) => sendResponse({ type: 'error', error: String(e) }));
    return true;
  });

  chrome.runtime.onInstalled.addListener(() => {
    void loadState();
  });
});

async function handle(msg: Message) {
  switch (msg.type) {
    case 'getResolvedSettings': {
      const state = await loadState();
      return { type: 'settings' as const, settings: resolveSettings(state, msg.origin) };
    }
    case 'updateUxDna': {
      const state = await updateUxDna(msg.uxDna);
      return { type: 'state' as const, state };
    }
    case 'updateSiteOverride': {
      const state = await updateSiteOverride(msg.origin, msg.override);
      return { type: 'state' as const, state };
    }
    case 'getState': {
      const state = await loadState();
      return { type: 'state' as const, state };
    }
    case 'getSuggestions': {
      const routeKey = routeKeyFromUrl(msg.url);
      if (!routeKey) return { type: 'suggestions' as const, suggestions: [] };
      const heatmap = await loadRouteHeatmap(routeKey);
      if (!heatmap) return { type: 'suggestions' as const, suggestions: [] };
      const state = await loadState();
      const origin = new URL(msg.url).origin;
      const dismissed = new Set(state.sites[origin]?.dismissedSuggestionIds ?? []);
      const existingRules = state.sites[origin]?.customRules ?? [];
      const all = generateSuggestions(heatmap);
      const filtered: Suggestion[] = all.filter(
        (s) => !dismissed.has(s.id) && !ruleAlreadyApplied(s, existingRules),
      );
      return { type: 'suggestions' as const, suggestions: filtered };
    }
    case 'applySuggestion': {
      const state = await addCustomRule(msg.origin, msg.anchor, 'suggestion');
      return { type: 'state' as const, state };
    }
    case 'dismissSuggestion': {
      const state = await dismissSuggestion(msg.origin, msg.suggestionId);
      return { type: 'state' as const, state };
    }
    case 'removeCustomRule': {
      const state = await removeCustomRule(msg.origin, msg.ruleId);
      return { type: 'state' as const, state };
    }
    default:
      return { type: 'error' as const, error: 'unknown message' };
  }
}

function ruleAlreadyApplied(
  s: Suggestion,
  rules: { anchor: { tag: string; structuralPath: string } }[],
): boolean {
  return rules.some(
    (r) =>
      r.anchor.tag === s.anchor.tag && r.anchor.structuralPath === s.anchor.structuralPath,
  );
}
