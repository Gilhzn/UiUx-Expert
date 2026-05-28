import {
  loadState,
  updateUxDna,
  updateSiteOverride,
  resolveSettings,
} from '../core/storage/profile';
import type { Message } from '../core/storage/types';

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
    default:
      return { type: 'error' as const, error: 'unknown message' };
  }
}
