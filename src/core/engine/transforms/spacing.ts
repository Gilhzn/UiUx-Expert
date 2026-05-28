import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

const DENSITY_MAP = {
  compact: { paragraphMargin: '0.5em', listGap: '0.25em' },
  normal: { paragraphMargin: '1em', listGap: '0.5em' },
  comfortable: { paragraphMargin: '1.5em', listGap: '0.75em' },
} as const;

export function spacingRules(dna: UxDna): CssRule[] {
  const cfg = DENSITY_MAP[dna.spacing.density];
  return [
    { selector: 'p', declarations: { margin: `${cfg.paragraphMargin} 0` } },
    { selector: 'li', declarations: { 'margin-bottom': cfg.listGap } },
  ];
}
