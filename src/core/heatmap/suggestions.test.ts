import { describe, it, expect } from 'vitest';
import { generateSuggestions, describeAnchor } from './suggestions';
import type { RouteHeatmap, HeatmapElementSignal } from './types';
import type { SelectorAnchor } from '../selectors/resilientSelector';

function anchor(over: Partial<SelectorAnchor> = {}): SelectorAnchor {
  return {
    tag: 'div',
    role: null,
    ariaLabel: null,
    accessibleName: null,
    classFingerprint: '',
    structuralPath: 'body>div:nth-child(1)',
    ...over,
  };
}

function signal(over: Partial<HeatmapElementSignal> = {}): HeatmapElementSignal {
  return {
    anchor: anchor(),
    visibilityMs: 0,
    clicks: 0,
    selections: 0,
    interactions: 0,
    lastSeen: 0,
    ...over,
  };
}

function heatmap(elements: HeatmapElementSignal[], over: Partial<RouteHeatmap> = {}): RouteHeatmap {
  return {
    route: 'https://example.com/page',
    sessions: 5,
    totalActiveMs: 60_000,
    elements,
    updatedAt: 0,
    ...over,
  };
}

describe('generateSuggestions', () => {
  it('returns nothing when sessions are below threshold', () => {
    const h = heatmap([signal({ visibilityMs: 50_000 })], { sessions: 1 });
    expect(generateSuggestions(h)).toEqual([]);
  });

  it('returns nothing when totalActiveMs is below threshold', () => {
    const h = heatmap([signal({ visibilityMs: 5_000 })], { totalActiveMs: 1_000 });
    expect(generateSuggestions(h)).toEqual([]);
  });

  it('skips elements with interactions', () => {
    const h = heatmap([signal({ visibilityMs: 50_000, interactions: 1, clicks: 1 })]);
    expect(generateSuggestions(h)).toEqual([]);
  });

  it('skips main content tags', () => {
    const h = heatmap([
      signal({
        anchor: anchor({ tag: 'main', role: 'main' }),
        visibilityMs: 50_000,
      }),
    ]);
    expect(generateSuggestions(h)).toEqual([]);
  });

  it('suggests a high-visibility, never-interacted-with element', () => {
    const h = heatmap([
      signal({
        anchor: anchor({ tag: 'aside', accessibleName: 'Newsletter signup' }),
        visibilityMs: 40_000,
      }),
    ]);
    const out = generateSuggestions(h);
    expect(out).toHaveLength(1);
    expect(out[0]?.action).toBe('hide');
    expect(out[0]?.anchor.tag).toBe('aside');
    expect(out[0]?.confidence).toBeGreaterThan(0.5);
  });

  it('confidence rises for decorative landmarks', () => {
    const plain = generateSuggestions(
      heatmap([signal({ anchor: anchor({ tag: 'div' }), visibilityMs: 30_000 })]),
    );
    const decorative = generateSuggestions(
      heatmap([
        signal({
          anchor: anchor({ tag: 'aside', role: 'complementary' }),
          visibilityMs: 30_000,
        }),
      ]),
    );
    expect(decorative[0]?.confidence ?? 0).toBeGreaterThan(plain[0]?.confidence ?? 0);
  });

  it('sorts by confidence and caps the list', () => {
    const elements = Array.from({ length: 10 }, (_, i) =>
      signal({
        anchor: anchor({
          tag: 'aside',
          structuralPath: `body>aside:nth-child(${i + 1})`,
        }),
        visibilityMs: 30_000 - i * 2_000,
      }),
    );
    const out = generateSuggestions(heatmap(elements, { totalActiveMs: 200_000 }));
    expect(out.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1];
      const cur = out[i];
      if (prev && cur) expect(prev.confidence).toBeGreaterThanOrEqual(cur.confidence);
    }
  });
});

describe('describeAnchor', () => {
  it('prefers aria-label over text', () => {
    expect(describeAnchor(anchor({ tag: 'button', ariaLabel: 'Buy now', accessibleName: 'Buy' }))).toContain('Buy now');
  });

  it('falls back to accessible name', () => {
    expect(describeAnchor(anchor({ tag: 'a', accessibleName: 'Sign in' }))).toContain('Sign in');
  });

  it('falls back to role then tag', () => {
    expect(describeAnchor(anchor({ tag: 'aside', role: 'complementary' }))).toContain(
      'complementary',
    );
    expect(describeAnchor(anchor({ tag: 'div' }))).toBe('div');
  });
});
