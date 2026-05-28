import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

export function focusModeRules(dna: UxDna): CssRule[] {
  const { dimLevel } = dna.focusMode;
  const opacity = String(Math.max(0, 1 - dimLevel));
  return [
    {
      selector:
        'header, nav, footer, aside, [role="banner"], [role="navigation"], [role="contentinfo"], [role="complementary"]',
      declarations: { opacity, transition: 'opacity 0.15s' },
    },
  ];
}
