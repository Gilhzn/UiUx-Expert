import type { Message, ResolvedSettings, StoredState } from '../core/storage/types';
import type { Suggestion } from '../core/heatmap/types';
import type { CachedBlueprint } from '../core/blueprint/types';

export type MessageResponse =
  | { type: 'state'; state: StoredState }
  | { type: 'settings'; settings: ResolvedSettings }
  | { type: 'suggestions'; suggestions: Suggestion[] }
  | { type: 'blueprint'; cached: CachedBlueprint | null; reason?: string }
  | { type: 'ok' }
  | { type: 'error'; error: string };

export async function sendMessage(msg: Message): Promise<MessageResponse> {
  try {
    const resp = (await chrome.runtime.sendMessage(msg)) as MessageResponse | undefined;
    return resp ?? { type: 'error', error: 'no response' };
  } catch (e) {
    return { type: 'error', error: String(e) };
  }
}
