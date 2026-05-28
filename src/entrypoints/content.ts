import { applyTransforms, removeStyle, STYLE_ID } from '../core/engine/transformEngine';
import { applyCustomRules, clearCustomRules } from '../core/engine/customRules';
import { verify } from '../core/verify/verifier';
import { startHeatmapEngine } from '../core/heatmap/heatmapEngine';
import type { HeatmapEngineHandle } from '../core/heatmap/heatmapEngine';
import { routeKey as makeRouteKey } from '../core/heatmap/routeKey';
import { skeletonize } from '../core/skeletonizer/skeletonizer';
import { blueprintToCustomRules } from '../core/blueprint/applyBlueprint';
import { sendMessage } from '../shared/messaging';
import type { CachedBlueprint } from '../core/blueprint/types';
import type { CustomRule, ResolvedSettings } from '../core/storage/types';

const SETTINGS_STORAGE_KEY = 'adaptiveUiState';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    const origin = location.origin;
    let currentSettings: ResolvedSettings | null = null;
    let activeBlueprint: CachedBlueprint | null = null;
    let heatmap: HeatmapEngineHandle | null = null;

    try {
      const resp = await sendMessage({ type: 'getResolvedSettings', origin });
      if (resp.type === 'settings') currentSettings = resp.settings;
    } catch (e) {
      console.debug('[AdaptiveUI] failed to load settings:', e);
    }
    if (!currentSettings) return;

    const rulesFor = (settings: ResolvedSettings): CustomRule[] => {
      const base = settings.customRules;
      if (!activeBlueprint || activeBlueprint.quarantined) return base;
      return [...base, ...blueprintToCustomRules(activeBlueprint.blueprint, origin)];
    };

    const apply = () => {
      if (!currentSettings) return;
      const result = applyTransforms(currentSettings);
      if (!result.ok) return;
      applyCustomRules(rulesFor(currentSettings));
      scheduleVerify();
    };

    const scheduleVerify = () => {
      const run = () => {
        const report = verify();
        if (!report.ok) {
          console.warn('[AdaptiveUI] verifier rollback:', report.issues);
          removeStyle();
          clearCustomRules();
          if (activeBlueprint) {
            const hash = activeBlueprint.blueprint.structuralHash;
            activeBlueprint = null;
            void sendMessage({ type: 'reportBlueprintFailure', structuralHash: hash });
          }
        }
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(run, { timeout: 1500 });
      } else {
        setTimeout(run, 500);
      }
    };

    apply();

    const startObserver = () => {
      const observer = new MutationObserver(() => {
        if (!currentSettings) return;
        const styleEl = document.getElementById(STYLE_ID);
        const head = document.head ?? document.documentElement;
        if (!styleEl || styleEl.parentElement !== head) {
          apply();
        } else {
          const rules = rulesFor(currentSettings);
          if (rules.length > 0) applyCustomRules(rules);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.head) {
      startObserver();
    } else {
      const hookHead = new MutationObserver(() => {
        if (document.head) {
          hookHead.disconnect();
          startObserver();
        }
      });
      hookHead.observe(document.documentElement, { childList: true });
    }

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      if (!(SETTINGS_STORAGE_KEY in changes)) return;
      const resp = await sendMessage({ type: 'getResolvedSettings', origin });
      if (resp.type === 'settings') {
        currentSettings = resp.settings;
        apply();
        void tryFetchBlueprint();
      }
    });

    const startHeatmap = async () => {
      if (heatmap || !currentSettings?.enabled) return;
      const key = makeRouteKey(origin, location.pathname);
      try {
        heatmap = await startHeatmapEngine(key);
      } catch (e) {
        console.debug('[AdaptiveUI] heatmap engine failed to start:', e);
      }
    };

    const tryFetchBlueprint = async () => {
      if (!currentSettings?.enabled) return;
      if (!currentSettings.uxDna.blueprint.enabled) return;
      if (!currentSettings.uxDna.blueprint.serverUrl) return;
      const root = document.body;
      if (!root) return;
      const skel = skeletonize(root);
      try {
        const resp = await sendMessage({
          type: 'fetchBlueprint',
          structuralHash: skel.hash,
          skeleton: skel.root,
        });
        if (resp.type === 'blueprint' && resp.cached && !resp.cached.quarantined) {
          activeBlueprint = resp.cached;
          apply();
        }
      } catch (e) {
        console.debug('[AdaptiveUI] blueprint fetch failed:', e);
      }
    };

    const onReady = () => {
      void startHeatmap();
      void tryFetchBlueprint();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }

    let lastPath = location.pathname;
    const observerForRoute = new MutationObserver(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        heatmap?.stop();
        heatmap = null;
        activeBlueprint = null;
        void startHeatmap();
        void tryFetchBlueprint();
      }
    });
    observerForRoute.observe(document.documentElement, { childList: true, subtree: true });
  },
});
