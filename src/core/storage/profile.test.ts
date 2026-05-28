import { describe, it, expect } from 'vitest';
import { resolveSettings, DEFAULT_STATE } from './profile';
import type { StoredState } from './types';

function clone(s: StoredState): StoredState {
  return JSON.parse(JSON.stringify(s));
}

describe('resolveSettings', () => {
  it('returns DNA defaults when site has no override', () => {
    const settings = resolveSettings(DEFAULT_STATE, 'https://example.com');
    expect(settings.enabled).toBe(true);
    expect(settings.transforms.typography).toBe(false);
    expect(settings.transforms.declutter).toBe(false);
  });

  it('site transform override beats DNA', () => {
    const state = clone(DEFAULT_STATE);
    state.uxDna.typography.enabled = true;
    state.sites['https://example.com'] = {
      origin: 'https://example.com',
      enabled: null,
      transforms: { typography: false },
      customRules: [],
      dismissedSuggestionIds: [],
    };
    const settings = resolveSettings(state, 'https://example.com');
    expect(settings.transforms.typography).toBe(false);
  });

  it('site-level disable overrides DNA enabled', () => {
    const state = clone(DEFAULT_STATE);
    state.sites['https://example.com'] = {
      origin: 'https://example.com',
      enabled: false,
      transforms: {},
      customRules: [],
      dismissedSuggestionIds: [],
    };
    const settings = resolveSettings(state, 'https://example.com');
    expect(settings.enabled).toBe(false);
  });

  it('resolved settings expose customRules for the origin', () => {
    const state = clone(DEFAULT_STATE);
    state.sites['https://example.com'] = {
      origin: 'https://example.com',
      enabled: null,
      transforms: {},
      customRules: [
        {
          id: 'r1',
          origin: 'https://example.com',
          anchor: {
            tag: 'div',
            role: null,
            ariaLabel: null,
            accessibleName: null,
            classFingerprint: '',
            structuralPath: 'body>div:nth-child(1)',
          },
          action: 'hide',
          source: 'suggestion',
          createdAt: 1,
        },
      ],
      dismissedSuggestionIds: [],
    };
    const settings = resolveSettings(state, 'https://example.com');
    expect(settings.customRules).toHaveLength(1);
    expect(settings.customRules[0]?.id).toBe('r1');
  });

  it('UX DNA applies to a brand new site (cold start solved)', () => {
    const state = clone(DEFAULT_STATE);
    state.uxDna.contrast.enabled = true;
    state.uxDna.declutter.enabled = true;
    const settings = resolveSettings(state, 'https://brand-new-site.example');
    expect(settings.transforms.contrast).toBe(true);
    expect(settings.transforms.declutter).toBe(true);
  });
});
