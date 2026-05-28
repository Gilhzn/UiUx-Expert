import type { SelectorAnchor } from '../selectors/resilientSelector';

export type TransformId =
  | 'typography'
  | 'spacing'
  | 'contrast'
  | 'declutter'
  | 'focusMode'
  | 'motion';

export interface CustomRule {
  id: string;
  origin: string;
  anchor: SelectorAnchor;
  action: 'hide';
  source: 'suggestion' | 'manual';
  createdAt: number;
}

export interface UxDna {
  enabled: boolean;
  typography: {
    enabled: boolean;
    fontScale: number;
    lineHeight: number;
  };
  spacing: {
    enabled: boolean;
    density: 'compact' | 'normal' | 'comfortable';
  };
  contrast: {
    enabled: boolean;
    mode: 'auto' | 'light' | 'dark';
    boost: number;
  };
  declutter: {
    enabled: boolean;
    hideAds: boolean;
    hideStickyBars: boolean;
    hideCookieBanners: boolean;
  };
  focusMode: {
    enabled: boolean;
    dimLevel: number;
  };
  motion: {
    enabled: boolean;
    reduce: boolean;
  };
}

export interface SiteOverride {
  origin: string;
  enabled: boolean | null;
  transforms: Partial<Record<TransformId, boolean>>;
  customRules: CustomRule[];
  dismissedSuggestionIds: string[];
}

export interface StoredState {
  version: number;
  uxDna: UxDna;
  sites: Record<string, SiteOverride>;
}

export interface ResolvedSettings {
  enabled: boolean;
  transforms: Record<TransformId, boolean>;
  uxDna: UxDna;
  customRules: CustomRule[];
}

export interface VerifierIssue {
  kind: 'overflow' | 'content-collapsed' | 'interactive-broken';
  detail: string;
}

export interface VerifierReport {
  ok: boolean;
  issues: VerifierIssue[];
  appliedAt: number;
}

export type Message =
  | { type: 'getResolvedSettings'; origin: string }
  | { type: 'updateUxDna'; uxDna: Partial<UxDna> }
  | { type: 'updateSiteOverride'; origin: string; override: Partial<SiteOverride> }
  | { type: 'getState' }
  | { type: 'getSuggestions'; url: string }
  | { type: 'applySuggestion'; origin: string; suggestionId: string; anchor: SelectorAnchor }
  | { type: 'dismissSuggestion'; origin: string; suggestionId: string }
  | { type: 'removeCustomRule'; origin: string; ruleId: string };
