import { applyTransforms, removeStyle, STYLE_ID } from '../core/engine/transformEngine';
import { applyCustomRules, clearCustomRules } from '../core/engine/customRules';
import { applyStickyBars, clearStickyBars } from '../core/engine/transforms/stickyBars';
import { applyTier1Reorders, clearTier1Reorders } from '../core/engine/tier1Reorder';
import { verify } from '../core/verify/verifier';
import { startHeatmapEngine } from '../core/heatmap/heatmapEngine';
import type { HeatmapEngineHandle } from '../core/heatmap/heatmapEngine';
import { routeKey as makeRouteKey } from '../core/heatmap/routeKey';
import { skeletonize } from '../core/skeletonizer/skeletonizer';
import { blueprintHideRules, blueprintReorderRules } from '../core/blueprint/applyBlueprint';
import { sendMessage } from '../shared/messaging';
import type { CachedBlueprint } from '../core/blueprint/types';
import type { CustomRule, ResolvedSettings, TransformId } from '../core/storage/types';
import { emptyStatus, type ApplyStatus, type ApplyChange } from '../core/applyStatus/applyStatus';

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
      return [...base, ...blueprintHideRules(activeBlueprint.blueprint, origin)];
    };

    const reordersFor = () => {
      if (!activeBlueprint || activeBlueprint.quarantined) return [];
      return blueprintReorderRules(activeBlueprint.blueprint);
    };

    const apply = () => {
      if (!currentSettings) return;
      const status = emptyStatus(origin);
      status.enabled = currentSettings.enabled;
      const css = applyTransforms(currentSettings);
      if (!css.ok) return;
      status.activeTransforms = css.applied as TransformId[];
      for (const id of status.activeTransforms) {
        status.changes.push({ kind: 'tier0', label: id });
      }

      const customRules = rulesFor(currentSettings);
      const customApply = applyCustomRules(customRules);
      status.customRulesApplied = customApply.applied;
      for (const rule of currentSettings.customRules) {
        status.changes.push({ kind: 'custom-rule', id: rule.id, label: rule.anchor.tag });
      }

      let stickyHidden = 0;
      if (
        currentSettings.uxDna.declutter.enabled &&
        currentSettings.uxDna.declutter.hideStickyBars
      ) {
        stickyHidden = applyStickyBars().hidden;
      } else {
        clearStickyBars();
      }
      status.stickyBarsHidden = stickyHidden;

      const reorders = reordersFor();
      const tier1 = applyTier1Reorders(reorders);
      status.blueprintReorder = tier1.applied;

      if (activeBlueprint && !activeBlueprint.quarantined) {
        for (const t of activeBlueprint.blueprint.transforms) {
          if (t.action === 'hide') {
            status.blueprintHide += 1;
            status.changes.push({ kind: 'blueprint-hide', id: t.id, label: t.anchor.tag });
          } else if (t.action === 'reorder') {
            status.changes.push({ kind: 'blueprint-reorder', id: t.id, label: t.anchor.tag });
          }
        }
      }
      if (stickyHidden > 0) {
        status.changes.push({ kind: 'sticky-bar', label: `${stickyHidden} bar(s)` });
      }

      lastStatus = status;
      void sendMessage({ type: 'reportApplyStatus', status });
      scheduleVerify();
    };

    let lastStatus: ApplyStatus | null = null;

    const scheduleVerify = () => {
      const run = () => {
        const report = verify();
        if (!report.ok) {
          console.warn('[AdaptiveUI] verifier rollback:', report.issues);
          removeStyle();
          clearCustomRules();
          clearStickyBars();
          clearTier1Reorders();
          if (lastStatus) {
            lastStatus.verifierIssues = report.issues.map((i) => `${i.kind}: ${i.detail}`);
            void sendMessage({ type: 'reportApplyStatus', status: lastStatus });
          }
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
