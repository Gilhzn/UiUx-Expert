import type { UxDna } from '../../storage/types';
import type { CssRule } from '../cssBuilder';

/**
 * Dyslexia-friendly typography via a local-font stack:
 * - "OpenDyslexic" is picked up via local() if the user has it installed.
 * - "Comic Neue" / "Comic Sans MS" / "Lexie Readable" are common fallbacks.
 * - Verdana / Tahoma are the broadly-available system sans recommended by
 *   the British Dyslexia Association.
 *
 * We intentionally do not bundle a remote-fetched font — extension CSP
 * conflicts and supply-chain risk outweigh the benefit for an MVP. A user
 * who installs OpenDyslexic locally gets it automatically.
 */
const FONT_STACK = `'OpenDyslexic', 'Comic Neue', 'Lexie Readable', 'Comic Sans MS', Verdana, Tahoma, sans-serif`;

export function dyslexiaFontRules(_dna: UxDna): CssRule[] {
  return [
    {
      selector: 'body, body *',
      declarations: {
        'font-family': FONT_STACK,
        'letter-spacing': '0.03em',
        'word-spacing': '0.08em',
      },
    },
    {
      selector: 'pre, code, kbd, samp, tt',
      declarations: {
        'font-family': "ui-monospace, 'Cascadia Mono', 'Source Code Pro', monospace",
        'letter-spacing': 'normal',
        'word-spacing': 'normal',
      },
    },
  ];
}
