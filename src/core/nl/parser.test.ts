import { describe, it, expect } from 'vitest';
import { parseNl, applyActionsToUxDna } from './parser';
import type { UxDna } from '../storage/types';

const DNA: UxDna = {
  enabled: true,
  typography: { enabled: false, fontScale: 1.0, lineHeight: 1.5 },
  spacing: { enabled: false, density: 'normal' },
  contrast: { enabled: false, mode: 'auto', boost: 0 },
  declutter: { enabled: false, hideAds: true, hideStickyBars: true, hideCookieBanners: true },
  focusMode: { enabled: false, dimLevel: 0.4 },
  motion: { enabled: false, reduce: true },
  dyslexiaFont: { enabled: false },
  blueprint: { enabled: false, serverUrl: '', apiKey: '' },
  sync: { enabled: false, serverUrl: '', deviceId: '', passphraseSet: false },
};

describe('parseNl', () => {
  it('matches Hebrew "הסתר פרסומות"', () => {
    const r = parseNl('הסתר פרסומות עכשיו');
    expect(r.unrecognized).toBe(false);
    expect(r.actions).toContainEqual({ kind: 'toggleTransform', id: 'declutter', enabled: true });
  });

  it('matches English "hide ads"', () => {
    const r = parseNl('please hide ads');
    expect(r.actions).toContainEqual({ kind: 'toggleTransform', id: 'declutter', enabled: true });
  });

  it('switches to dark mode', () => {
    const r = parseNl('dark mode');
    expect(r.actions).toContainEqual({ kind: 'setContrastMode', mode: 'dark' });
    expect(r.actions).toContainEqual({ kind: 'toggleTransform', id: 'contrast', enabled: true });
  });

  it('matches Hebrew "מצב כהה"', () => {
    const r = parseNl('תעבור למצב כהה');
    expect(r.actions).toContainEqual({ kind: 'setContrastMode', mode: 'dark' });
  });

  it('bigger font emits a positive delta', () => {
    const r = parseNl('פונט גדול יותר');
    expect(r.actions).toContainEqual({ kind: 'setFontScale', delta: 0.1 });
  });

  it('smaller font emits a negative delta', () => {
    const r = parseNl('smaller text please');
    expect(r.actions).toContainEqual({ kind: 'setFontScale', delta: -0.1 });
  });

  it('reports unrecognized for empty / unknown', () => {
    expect(parseNl('').unrecognized).toBe(true);
    expect(parseNl('foo bar baz qux').unrecognized).toBe(true);
  });

  it('handles multiple intents in one sentence', () => {
    const r = parseNl('dark mode and bigger font');
    expect(r.actions.some((a) => a.kind === 'setContrastMode')).toBe(true);
    expect(r.actions.some((a) => a.kind === 'setFontScale')).toBe(true);
  });
});

describe('applyActionsToUxDna', () => {
  it('produces a patch that enables a transform', () => {
    const patch = applyActionsToUxDna(DNA, [
      { kind: 'toggleTransform', id: 'focusMode', enabled: true },
    ]);
    expect(patch.focusMode?.enabled).toBe(true);
  });

  it('clamps font scale to the allowed range', () => {
    const patch = applyActionsToUxDna(DNA, [{ kind: 'setFontScale', delta: 5 }]);
    expect(patch.typography?.fontScale).toBe(1.5);
    const patch2 = applyActionsToUxDna(DNA, [{ kind: 'setFontScale', delta: -5 }]);
    expect(patch2.typography?.fontScale).toBe(0.85);
  });

  it('setContrastMode also flips contrast.enabled true', () => {
    const patch = applyActionsToUxDna(DNA, [{ kind: 'setContrastMode', mode: 'dark' }]);
    expect(patch.contrast?.enabled).toBe(true);
    expect(patch.contrast?.mode).toBe('dark');
  });

  it('setSpacingDensity returns the requested density', () => {
    const patch = applyActionsToUxDna(DNA, [
      { kind: 'setSpacingDensity', density: 'comfortable' },
    ]);
    expect(patch.spacing?.density).toBe('comfortable');
    expect(patch.spacing?.enabled).toBe(true);
  });

  it('an empty action list returns an empty patch', () => {
    const patch = applyActionsToUxDna(DNA, []);
    expect(Object.keys(patch)).toEqual([]);
  });
});
