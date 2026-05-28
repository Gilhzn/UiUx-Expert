/**
 * Lightweight, dependency-free NL → intent parser.
 *
 * Recognises a fixed vocabulary in Hebrew + English and emits a list of
 * structured actions the background can apply. Anything it can't match
 * falls through with `unrecognized: true` so callers can decide whether
 * to retry via the Blueprint server.
 */

import type { TransformId, UxDna } from '../storage/types';

export type NlAction =
  | { kind: 'toggleTransform'; id: TransformId; enabled: boolean }
  | { kind: 'setContrastMode'; mode: 'light' | 'dark' | 'auto' }
  | { kind: 'setFontScale'; delta: number }
  | { kind: 'setSpacingDensity'; density: UxDna['spacing']['density'] };

export interface ParsedCommand {
  actions: NlAction[];
  matched: string[];
  unrecognized: boolean;
  source: 'heuristic';
}

interface Rule {
  pattern: RegExp;
  actions: NlAction[];
  /** Human-readable label for the matched phrase. */
  label: string;
}

const RULES: Rule[] = [
  // ----- declutter / hide -----
  {
    pattern: /(?:hide|remove)\s+ads?|תסתיר|הסתר.*?(?:פרסומ|מודעו)/i,
    actions: [{ kind: 'toggleTransform', id: 'declutter', enabled: true }],
    label: 'declutter on',
  },
  {
    pattern: /(?:show|restore)\s+ads?|תחזיר.*?(?:פרסומ|מודעו)/i,
    actions: [{ kind: 'toggleTransform', id: 'declutter', enabled: false }],
    label: 'declutter off',
  },
  // ----- dark / light mode -----
  {
    pattern: /dark\s+mode|מצב\s+כהה|לילה/i,
    actions: [
      { kind: 'toggleTransform', id: 'contrast', enabled: true },
      { kind: 'setContrastMode', mode: 'dark' },
    ],
    label: 'dark mode',
  },
  {
    pattern: /light\s+mode|מצב\s+בהיר|יום/i,
    actions: [
      { kind: 'toggleTransform', id: 'contrast', enabled: true },
      { kind: 'setContrastMode', mode: 'light' },
    ],
    label: 'light mode',
  },
  {
    pattern: /auto\s+(?:dark|theme)|מצב\s+אוטומטי/i,
    actions: [{ kind: 'setContrastMode', mode: 'auto' }],
    label: 'auto contrast',
  },
  // ----- focus mode -----
  {
    pattern: /focus\s+mode|מצב\s+ריכוז|reader/i,
    actions: [{ kind: 'toggleTransform', id: 'focusMode', enabled: true }],
    label: 'focus mode',
  },
  // ----- typography -----
  {
    pattern: /bigger\s+(?:font|text)|פונט\s+גדול|טקסט\s+גדול/i,
    actions: [
      { kind: 'toggleTransform', id: 'typography', enabled: true },
      { kind: 'setFontScale', delta: 0.1 },
    ],
    label: 'bigger font',
  },
  {
    pattern: /smaller\s+(?:font|text)|פונט\s+קטן|טקסט\s+קטן/i,
    actions: [
      { kind: 'toggleTransform', id: 'typography', enabled: true },
      { kind: 'setFontScale', delta: -0.1 },
    ],
    label: 'smaller font',
  },
  // ----- spacing density -----
  {
    pattern: /comfortable|נוח|רווח\s+גדול/i,
    actions: [
      { kind: 'toggleTransform', id: 'spacing', enabled: true },
      { kind: 'setSpacingDensity', density: 'comfortable' },
    ],
    label: 'comfortable spacing',
  },
  {
    pattern: /compact|צפוף|רווח\s+קטן/i,
    actions: [
      { kind: 'toggleTransform', id: 'spacing', enabled: true },
      { kind: 'setSpacingDensity', density: 'compact' },
    ],
    label: 'compact spacing',
  },
  // ----- motion -----
  {
    pattern: /(?:reduce|stop)\s+(?:animation|motion)|הפחת\s+אנימצי|בלי\s+אנימצי/i,
    actions: [{ kind: 'toggleTransform', id: 'motion', enabled: true }],
    label: 'reduce motion',
  },
  // ----- dyslexia -----
  {
    pattern: /dyslexia|דיסלקסי/i,
    actions: [{ kind: 'toggleTransform', id: 'dyslexiaFont', enabled: true }],
    label: 'dyslexia font',
  },
];

export function parseNl(input: string): ParsedCommand {
  const text = input.trim();
  if (!text) {
    return { actions: [], matched: [], unrecognized: true, source: 'heuristic' };
  }
  const matched: string[] = [];
  const actions: NlAction[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      matched.push(rule.label);
      for (const action of rule.actions) actions.push(action);
    }
  }
  return {
    actions,
    matched,
    unrecognized: actions.length === 0,
    source: 'heuristic',
  };
}

export function applyActionsToUxDna(dna: UxDna, actions: NlAction[]): Partial<UxDna> {
  const patch: Partial<UxDna> = {};

  function ensure<K extends keyof UxDna>(key: K): UxDna[K] {
    const current = patch[key];
    if (current) return current;
    const next = { ...(dna[key] as object) } as UxDna[K];
    patch[key] = next;
    return next;
  }

  for (const action of actions) {
    switch (action.kind) {
      case 'toggleTransform': {
        const t = ensure(action.id) as { enabled: boolean };
        t.enabled = action.enabled;
        break;
      }
      case 'setContrastMode': {
        const c = ensure('contrast') as UxDna['contrast'];
        c.mode = action.mode;
        c.enabled = true;
        break;
      }
      case 'setFontScale': {
        const typo = ensure('typography') as UxDna['typography'];
        const next = Math.min(1.5, Math.max(0.85, typo.fontScale + action.delta));
        typo.fontScale = Math.round(next * 100) / 100;
        break;
      }
      case 'setSpacingDensity': {
        const sp = ensure('spacing') as UxDna['spacing'];
        sp.density = action.density;
        sp.enabled = true;
        break;
      }
    }
  }
  return patch;
}
