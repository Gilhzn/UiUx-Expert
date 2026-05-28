import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

export function typographyRules(dna: UxDna): CssRule[] {
  const { fontScale, lineHeight } = dna.typography;
  return [
    { selector: 'html', declarations: { 'font-size': `${100 * fontScale}%` } },
    {
      selector: 'body, p, li, dd, dt, blockquote',
      declarations: { 'line-height': String(lineHeight) },
    },
  ];
}
