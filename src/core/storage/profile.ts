import type {
  StoredState,
  UxDna,
  SiteOverride,
  ResolvedSettings,
  TransformId,
  CustomRule,
} from './types';
import type { SelectorAnchor } from '../selectors/resilientSelector';
import { anchorKey } from '../selectors/resilientSelector';

const STORAGE_KEY = 'adaptiveUiState';
const SCHEMA_VERSION = 5;

const DEFAULT_UX_DNA: UxDna = {
  enabled: true,
  typography: { enabled: false, fontScale: 1.0, lineHeight: 1.5 },
  spacing: { enabled: false, density: 'normal' },
  contrast: { enabled: true, mode: 'auto', boost: 0 },
  declutter: { enabled: true, hideAds: true, hideStickyBars: true, hideCookieBanners: true },
  focusMode: { enabled: false, dimLevel: 0.4 },
  motion: { enabled: true, reduce: true },
  dyslexiaFont: { enabled: false },
  blueprint: { enabled: false, serverUrl: '', apiKey: '' },
  sync: { enabled: false, serverUrl: '', deviceId: '', passphraseSet: false },
  autonomy: { enabled: true, confidenceThreshold: 0.7, observationVisits: 3 },
};

const DEFAULT_STATE: StoredState = {
  version: SCHEMA_VERSION,
  uxDna: DEFAULT_UX_DNA,
  sites: {},
};

export async function loadState(): Promise<StoredState> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const state = raw[STORAGE_KEY] as StoredState | undefined;
  if (!state || state.version !== SCHEMA_VERSION) {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
    return structuredClone(DEFAULT_STATE);
  }
  return state;
}

export async function saveState(state: StoredState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function updateUxDna(patch: Partial<UxDna>): Promise<StoredState> {
  const state = await loadState();
  state.uxDna = mergeUxDna(state.uxDna, patch);
  await saveState(state);
  return state;
}

export async function updateSiteOverride(
  origin: string,
  override: Partial<SiteOverride>,
): Promise<StoredState> {
  const state = await loadState();
  const existing = ensureSiteOverride(state, origin);
  state.sites[origin] = {
    ...existing,
    ...override,
    transforms: { ...existing.transforms, ...(override.transforms ?? {}) },
    origin,
  };
  await saveState(state);
  return state;
}

export async function addCustomRule(
  origin: string,
  anchor: SelectorAnchor,
  source: CustomRule['source'] = 'suggestion',
): Promise<StoredState> {
  const state = await loadState();
  const site = ensureSiteOverride(state, origin);
  const id = anchorKey(anchor);
  if (!site.customRules.some((r) => r.id === id)) {
    site.customRules.push({
      id,
      origin,
      anchor,
      action: 'hide',
      source,
      createdAt: Date.now(),
    });
  }
  state.sites[origin] = site;
  await saveState(state);
  return state;
}

export async function removeCustomRule(origin: string, ruleId: string): Promise<StoredState> {
  const state = await loadState();
  const site = state.sites[origin];
  if (site) {
    site.customRules = site.customRules.filter((r) => r.id !== ruleId);
    state.sites[origin] = site;
    await saveState(state);
  }
  return state;
}

export async function dismissSuggestion(
  origin: string,
  suggestionId: string,
): Promise<StoredState> {
  const state = await loadState();
  const site = ensureSiteOverride(state, origin);
  if (!site.dismissedSuggestionIds.includes(suggestionId)) {
    site.dismissedSuggestionIds.push(suggestionId);
  }
  state.sites[origin] = site;
  await saveState(state);
  return state;
}

/**
 * Self-heal: when a page breaks, drop recent auto-applied suggestion rules
 * and remember the dismissed IDs so the heatmap stops re-suggesting them.
 * "Recent" defaults to the last 5 minutes.
 */
export async function rollbackRecentAutonomy(
  origin: string,
  withinMs = 5 * 60 * 1000,
): Promise<{ state: StoredState; removed: string[] }> {
  const state = await loadState();
  const site = ensureSiteOverride(state, origin);
  const cutoff = Date.now() - withinMs;
  const removed: string[] = [];
  site.customRules = site.customRules.filter((rule) => {
    if (rule.source !== 'suggestion') return true;
    if (rule.createdAt < cutoff) return true;
    removed.push(rule.id);
    if (!site.dismissedSuggestionIds.includes(rule.id)) {
      site.dismissedSuggestionIds.push(rule.id);
    }
    return false;
  });
  state.sites[origin] = site;
  await saveState(state);
  return { state, removed };
}

function ensureSiteOverride(state: StoredState, origin: string): SiteOverride {
  const existing = state.sites[origin];
  if (existing) {
    return {
      origin,
      enabled: existing.enabled ?? null,
      transforms: existing.transforms ?? {},
      customRules: existing.customRules ?? [],
      dismissedSuggestionIds: existing.dismissedSuggestionIds ?? [],
    };
  }
  return {
    origin,
    enabled: null,
    transforms: {},
    customRules: [],
    dismissedSuggestionIds: [],
  };
}

export function resolveSettings(state: StoredState, origin: string): ResolvedSettings {
  const dna = state.uxDna;
  const site = state.sites[origin];
  const transforms: Record<TransformId, boolean> = {
    typography: dna.typography.enabled,
    spacing: dna.spacing.enabled,
    contrast: dna.contrast.enabled,
    declutter: dna.declutter.enabled,
    focusMode: dna.focusMode.enabled,
    motion: dna.motion.enabled,
    dyslexiaFont: dna.dyslexiaFont.enabled,
  };
  if (site) {
    for (const key of Object.keys(site.transforms) as TransformId[]) {
      const v = site.transforms[key];
      if (typeof v === 'boolean') transforms[key] = v;
    }
  }
  const enabled = site?.enabled ?? dna.enabled;
  return { enabled, transforms, uxDna: dna, customRules: site?.customRules ?? [] };
}

function mergeUxDna(base: UxDna, patch: Partial<UxDna>): UxDna {
  const result: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const k of Object.keys(patch) as (keyof UxDna)[]) {
    const v = patch[k];
    const baseVal = (base as unknown as Record<string, unknown>)[k];
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[k] = { ...(baseVal as object), ...(v as object) };
    } else {
      result[k] = v;
    }
  }
  return result as unknown as UxDna;
}

export { DEFAULT_UX_DNA, DEFAULT_STATE, STORAGE_KEY, SCHEMA_VERSION };
