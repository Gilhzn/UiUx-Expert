import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateAutonomyForRoute, _resetForTests } from './autonomy';

interface MemStore {
  [k: string]: unknown;
}

const memory: MemStore = {};

beforeEach(() => {
  for (const k of Object.keys(memory)) delete memory[k];
  _resetForTests();

  const storage = {
    local: {
      get: vi.fn(async (key?: string | string[] | null) => {
        if (key === null || key === undefined) return { ...memory };
        if (typeof key === 'string') return key in memory ? { [key]: memory[key] } : {};
        const out: MemStore = {};
        for (const k of key) if (k in memory) out[k] = memory[k];
        return out;
      }),
      set: vi.fn(async (entries: MemStore) => {
        for (const [k, v] of Object.entries(entries)) memory[k] = v;
      }),
      remove: vi.fn(async (key: string) => {
        delete memory[key];
      }),
    },
    onChanged: { addListener: vi.fn() },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = { storage };
});

function seedState(autonomy: { enabled: boolean; threshold: number; visits: number }) {
  memory['adaptiveUiState'] = {
    version: 5,
    uxDna: {
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
      autonomy: {
        enabled: autonomy.enabled,
        confidenceThreshold: autonomy.threshold,
        observationVisits: autonomy.visits,
      },
    },
    sites: {},
  };
}

function seedHeatmap(
  routeKey: string,
  sessions = 5,
  totalActiveMs = 60_000,
  visibilityMs = 40_000,
) {
  memory[`heatmap:${routeKey}`] = {
    route: routeKey,
    sessions,
    totalActiveMs,
    elements: [
      {
        anchor: {
          tag: 'aside',
          role: 'complementary',
          ariaLabel: null,
          accessibleName: null,
          classFingerprint: 'h',
          structuralPath: 'body>aside:nth-child(3)',
        },
        visibilityMs,
        clicks: 0,
        selections: 0,
        interactions: 0,
        lastSeen: 0,
      },
    ],
    updatedAt: 0,
  };
}

describe('evaluateAutonomyForRoute', () => {
  it('promotes a confident suggestion into a custom rule', async () => {
    seedState({ enabled: true, threshold: 0.5, visits: 3 });
    seedHeatmap('https://example.com/page');
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(1);
    const state = memory['adaptiveUiState'] as { sites: Record<string, { customRules: unknown[] }> };
    expect(state.sites['https://example.com']?.customRules).toHaveLength(1);
  });

  it('does nothing when autonomy is disabled', async () => {
    seedState({ enabled: false, threshold: 0.5, visits: 3 });
    seedHeatmap('https://example.com/page');
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(0);
    expect(result.reason).toMatch(/off/);
  });

  it('respects the observation visits gate', async () => {
    seedState({ enabled: true, threshold: 0.5, visits: 10 });
    seedHeatmap('https://example.com/page', /* sessions= */ 2);
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(0);
  });

  it('respects the confidence threshold', async () => {
    // Low visibility ratio (10s out of 100s) → confidence ≈ 0.15+0.3 = 0.45, below 0.6.
    seedState({ enabled: true, threshold: 0.6, visits: 3 });
    seedHeatmap('https://example.com/page', 5, 100_000, 10_000);
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(0);
  });

  it('skips sites the user explicitly disabled', async () => {
    seedState({ enabled: true, threshold: 0.5, visits: 3 });
    seedHeatmap('https://example.com/page');
    const state = memory['adaptiveUiState'] as { sites: Record<string, unknown> };
    state.sites['https://example.com'] = {
      origin: 'https://example.com',
      enabled: false,
      transforms: {},
      customRules: [],
      dismissedSuggestionIds: [],
    };
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(0);
    expect(result.reason).toMatch(/disabled/);
  });

  it('does not re-add a rule that already exists', async () => {
    seedState({ enabled: true, threshold: 0.5, visits: 3 });
    seedHeatmap('https://example.com/page');
    await evaluateAutonomyForRoute('https://example.com/page');
    _resetForTests();
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(0);
  });

  it('skips dismissed suggestions', async () => {
    seedState({ enabled: true, threshold: 0.5, visits: 3 });
    seedHeatmap('https://example.com/page');
    const state = memory['adaptiveUiState'] as { sites: Record<string, unknown> };
    state.sites['https://example.com'] = {
      origin: 'https://example.com',
      enabled: null,
      transforms: {},
      customRules: [],
      dismissedSuggestionIds: [
        'https://example.com/page::aside|complementary|||h|body>aside:nth-child(3)',
      ],
    };
    const result = await evaluateAutonomyForRoute('https://example.com/page');
    expect(result.appliedCount).toBe(0);
  });
});
