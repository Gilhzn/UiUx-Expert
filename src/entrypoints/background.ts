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
import { fetchBlueprint } from '../core/blueprint/client';
import { reportBlueprintFeedback } from '../core/blueprint/feedback';
import { parseNl, applyActionsToUxDna } from '../core/nl/parser';
import { uploadUxDna, downloadUxDna } from '../core/sync/sync';
import { randomDeviceId } from '../core/sync/crypto';
import type { ApplyStatus } from '../core/applyStatus/applyStatus';
import {
  freshCachedBlueprint,
  loadCachedBlueprint,
  recordBlueprintFailure,
} from '../core/blueprint/blueprintStorage';
import type { SkeletonNode } from '../core/skeletonizer/skeletonizer';
import type { Message } from '../core/storage/types';
import type { Suggestion } from '../core/heatmap/types';
import type { CachedBlueprint } from '../core/blueprint/types';

const APPLY_STATUS_BY_TAB = new Map<number, ApplyStatus>();
const APPLY_STATUS_BY_ORIGIN = new Map<string, ApplyStatus>();

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    handle(msg, sender)
      .then(sendResponse)
      .catch((e) => sendResponse({ type: 'error', error: String(e) }));
    return true;
  });

  chrome.runtime.onInstalled.addListener(async () => {
    const state = await loadState();
    if (!state.uxDna.sync.deviceId) {
      state.uxDna.sync.deviceId = randomDeviceId();
      await updateUxDna({ sync: { ...state.uxDna.sync, deviceId: state.uxDna.sync.deviceId } });
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    APPLY_STATUS_BY_TAB.delete(tabId);
  });
});

async function handle(msg: Message, sender: chrome.runtime.MessageSender) {
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
    case 'fetchBlueprint': {
      const state = await loadState();
      const { enabled, serverUrl, apiKey } = state.uxDna.blueprint;
      if (!enabled || !serverUrl) {
        return { type: 'blueprint' as const, cached: null, reason: 'disabled' };
      }
      const existing = await loadCachedBlueprint(msg.structuralHash);
      if (existing && !existing.quarantined) {
        return { type: 'blueprint' as const, cached: existing, reason: 'local-cache' };
      }
      if (existing?.quarantined) {
        return { type: 'blueprint' as const, cached: null, reason: 'quarantined' };
      }
      const result = await fetchBlueprint({
        serverUrl,
        apiKey: apiKey || undefined,
        structuralHash: msg.structuralHash,
        skeleton: msg.skeleton as SkeletonNode,
      });
      if (!result.ok || !result.blueprint) {
        return { type: 'blueprint' as const, cached: null, reason: result.error ?? 'fetch failed' };
      }
      const fresh: CachedBlueprint = await freshCachedBlueprint(result.blueprint);
      return { type: 'blueprint' as const, cached: fresh, reason: result.source };
    }
    case 'reportBlueprintFailure': {
      await recordBlueprintFailure(msg.structuralHash);
      const state = await loadState();
      const { serverUrl, apiKey } = state.uxDna.blueprint;
      if (serverUrl) {
        void reportBlueprintFeedback({
          serverUrl,
          apiKey: apiKey || undefined,
          structuralHash: msg.structuralHash,
          verifierFailed: true,
        });
      }
      return { type: 'ok' as const };
    }
    case 'runNlCommand': {
      const parsed = parseNl(msg.text);
      if (parsed.unrecognized) {
        return { type: 'nl' as const, ok: false, matched: [], unrecognized: true };
      }
      const state = await loadState();
      const patch = applyActionsToUxDna(state.uxDna, parsed.actions);
      const next = await updateUxDna(patch);
      return {
        type: 'nl' as const,
        ok: true,
        matched: parsed.matched,
        unrecognized: false,
        state: next,
      };
    }
    case 'syncUpload': {
      const state = await loadState();
      const { serverUrl, deviceId } = state.uxDna.sync;
      if (!serverUrl) return { type: 'sync' as const, ok: false, error: 'no server URL set' };
      if (!deviceId) return { type: 'sync' as const, ok: false, error: 'no deviceId' };
      const result = await uploadUxDna({
        serverUrl,
        apiKey: state.uxDna.blueprint.apiKey || undefined,
        passphrase: msg.passphrase,
        deviceId,
        uxDna: state.uxDna,
      });
      if (result.ok) {
        await updateUxDna({ sync: { ...state.uxDna.sync, passphraseSet: true } });
      }
      return { type: 'sync' as const, ...result };
    }
    case 'syncDownload': {
      const state = await loadState();
      const { serverUrl, deviceId } = state.uxDna.sync;
      if (!serverUrl) return { type: 'sync' as const, ok: false, error: 'no server URL set' };
      if (!deviceId) return { type: 'sync' as const, ok: false, error: 'no deviceId' };
      const result = await downloadUxDna({
        serverUrl,
        apiKey: state.uxDna.blueprint.apiKey || undefined,
        passphrase: msg.passphrase,
        deviceId,
      });
      if (result.ok && result.uxDna) {
        await updateUxDna(result.uxDna);
      }
      return { type: 'sync' as const, ok: result.ok, error: result.error };
    }
    case 'reportApplyStatus': {
      const status = msg.status as ApplyStatus | undefined;
      if (!status) return { type: 'ok' as const };
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        const enriched: ApplyStatus = { ...status, tabId };
        APPLY_STATUS_BY_TAB.set(tabId, enriched);
        APPLY_STATUS_BY_ORIGIN.set(status.origin, enriched);
      } else {
        APPLY_STATUS_BY_ORIGIN.set(status.origin, status);
      }
      return { type: 'ok' as const };
    }
    case 'getApplyStatus': {
      const status = APPLY_STATUS_BY_ORIGIN.get(msg.origin) ?? null;
      return { type: 'applyStatus' as const, status };
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
