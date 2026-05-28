import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

export function contrastRules(dna: UxDna): CssRule[] {
  const { mode, boost } = dna.contrast;
  const rules: CssRule[] = [];

  if (boost > 0) {
    rules.push({ selector: 'html', declarations: { filter: `contrast(${1 + boost})` } });
  }

  const shouldDark = mode === 'dark' || (mode === 'auto' && prefersDark());
  if (shouldDark) {
    rules.push({
      selector: 'html',
      declarations: {
        'color-scheme': 'dark',
        filter: 'invert(0.92) hue-rotate(180deg)',
      },
    });
    rules.push({
      selector: 'img, video, picture, svg, iframe, [style*="background-image"]',
      declarations: { filter: 'invert(1) hue-rotate(180deg)' },
    });
  }

  return rules;
}

function prefersDark(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
