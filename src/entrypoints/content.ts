import { applyTransforms, removeStyle, STYLE_ID } from '../core/engine/transformEngine';
import { verify } from '../core/verify/verifier';
import { sendMessage } from '../shared/messaging';
import type { ResolvedSettings } from '../core/storage/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    const origin = location.origin;
    let currentSettings: ResolvedSettings | null = null;

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
      scheduleVerify();
    };

    const scheduleVerify = () => {
      const run = () => {
        const report = verify();
        if (!report.ok) {
          console.warn('[AdaptiveUI] verifier rollback:', report.issues);
          removeStyle();
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

    chrome.storage.onChanged.addListener(async (_changes, area) => {
      if (area !== 'local') return;
      const resp = await sendMessage({ type: 'getResolvedSettings', origin });
      if (resp.type === 'settings') {
        currentSettings = resp.settings;
        apply();
      }
    });
  },
});
