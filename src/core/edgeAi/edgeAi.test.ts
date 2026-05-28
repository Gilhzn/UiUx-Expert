import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isEdgeAiAvailable, categorizeElement, resetEdgeAiCacheForTests } from './edgeAi';
import type { SelectorAnchor } from '../selectors/resilientSelector';

const baseAnchor: SelectorAnchor = {
  tag: 'aside',
  role: null,
  ariaLabel: null,
  accessibleName: null,
  classFingerprint: '',
  structuralPath: 'body>aside:nth-child(2)',
};

describe('edgeAi', () => {
  beforeEach(() => {
    resetEdgeAiCacheForTests();
    delete (window as unknown as { ai?: unknown }).ai;
  });

  afterEach(() => {
    delete (window as unknown as { ai?: unknown }).ai;
    resetEdgeAiCacheForTests();
  });

  it('reports unavailable when window.ai is missing', async () => {
    expect(await isEdgeAiAvailable()).toBe(false);
    expect(await categorizeElement(baseAnchor)).toBeNull();
  });

  it('reports unavailable when capability is "no"', async () => {
    (window as unknown as { ai: unknown }).ai = {
      languageModel: {
        capabilities: async () => ({ available: 'no' }),
      },
    };
    expect(await isEdgeAiAvailable()).toBe(false);
  });

  it('reports available when capability is "readily" and categorizes', async () => {
    (window as unknown as { ai: unknown }).ai = {
      languageModel: {
        capabilities: async () => ({ available: 'readily' }),
        create: async () => ({
          prompt: async (_: string) => 'newsletter',
        }),
      },
    };
    expect(await isEdgeAiAvailable()).toBe(true);
    expect(await categorizeElement(baseAnchor)).toBe('newsletter');
  });

  it('falls back to "unknown" on noisy model output', async () => {
    (window as unknown as { ai: unknown }).ai = {
      languageModel: {
        capabilities: async () => ({ available: 'readily' }),
        create: async () => ({
          prompt: async () => 'Sure! It looks like a banner-ish element.',
        }),
      },
    };
    expect(await categorizeElement(baseAnchor)).toBe('unknown');
  });

  it('handles legacy window.ai shape (top-level canCreateTextSession)', async () => {
    (window as unknown as { ai: unknown }).ai = {
      canCreateTextSession: async () => 'readily',
      createTextSession: async () => ({ prompt: async () => 'ad' }),
    };
    expect(await isEdgeAiAvailable()).toBe(true);
    expect(await categorizeElement(baseAnchor)).toBe('ad');
  });

  it('returns null when prompt throws', async () => {
    (window as unknown as { ai: unknown }).ai = {
      languageModel: {
        capabilities: async () => ({ available: 'readily' }),
        create: async () => ({
          prompt: async () => {
            throw new Error('boom');
          },
        }),
      },
    };
    expect(await categorizeElement(baseAnchor)).toBeNull();
  });
});
