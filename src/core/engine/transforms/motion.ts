import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

export function motionRules(dna: UxDna): CssRule[] {
  if (!dna.motion.reduce) return [];
  return [
    {
      selector: '*, *::before, *::after',
      declarations: {
        'animation-duration': '0.001ms',
        'animation-iteration-count': '1',
        'transition-duration': '0.001ms',
        'scroll-behavior': 'auto',
      },
    },
  ];
}
