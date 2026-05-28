import { applyTransforms, removeStyle, STYLE_ID } from '../core/engine/transformEngine';
import { applyCustomRules, clearCustomRules } from '../core/engine/customRules';
import { verify } from '../core/verify/verifier';
import { startHeatmapEngine } from '../core/heatmap/heatmapEngine';
import type { HeatmapEngineHandle } from '../core/heatmap/heatmapEngine';
import { routeKey as makeRouteKey } from '../core/heatmap/routeKey';
import { sendMessage } from '../shared/messaging';
import type { ResolvedSettings } from '../core/storage/types';

const SETTINGS_STORAGE_KEY = 'adaptiveUiState';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    const origin = location.origin;
    let currentSettings: ResolvedSettings | null = null;
    let heatmap: HeatmapEngineHandle | null = null;

    try {
      const resp = await sendMessage({ type: 'getResolvedSettings', origin });
      if (resp.type === 'settings') currentSettings = resp.settings;
    } catch (e) {
      console.debug('[AdaptiveUI] failed to load settings:', e);
    }
    if (!currentSettings) return;

    const apply = () => {
      if (!currentSettings) return;
      const result = applyTransforms(currentSettings);
      if (!result.ok) return;
      applyCustomRules(currentSettings.customRules);
      scheduleVerify();
    };

    const scheduleVerify = () => {
      const run = () => {
        const report = verify();
        if (!report.ok) {
          console.warn('[AdaptiveUI] verifier rollback:', report.issues);
          removeStyle();
          clearCustomRules();
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
        const styleEl = document.getElementById(STYLE_ID);
        const head = document.head ?? document.documentElement;
        if (!styleEl || styleEl.parentElement !== head) {
          apply();
        } else if (currentSettings && currentSettings.customRules.length > 0) {
          applyCustomRules(currentSettings.customRules);
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

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { void startHeatmap(); });
    } else {
      void startHeatmap();
    }

    let lastPath = location.pathname;
    const observerForRoute = new MutationObserver(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        heatmap?.stop();
        heatmap = null;
        void startHeatmap();
      }
    });
    observerForRoute.observe(document.documentElement, { childList: true, subtree: true });
  },
});
