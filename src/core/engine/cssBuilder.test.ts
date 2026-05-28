import { describe, it, expect } from 'vitest';
import { buildCss } from './cssBuilder';

describe('cssBuilder', () => {
  it('declares the layer up front so !important rules in our layer beat unlayered !important', () => {
    const css = buildCss({ layerName: 'adaptive-ui', rules: [] });
    expect(css).toContain('@layer adaptive-ui;');
  });

  it('emits rules inside the named @layer block', () => {
    const css = buildCss({
      layerName: 'adaptive-ui',
      rules: [{ selector: 'html', declarations: { 'font-size': '120%' } }],
    });
    expect(css).toMatch(/@layer adaptive-ui\s*\{/);
    expect(css).toContain('html{font-size:120% !important}');
  });

  it('appends !important to every declaration', () => {
    const css = buildCss({
      layerName: 'adaptive-ui',
      rules: [{ selector: 'p', declarations: { color: 'red', 'font-size': '14px' } }],
    });
    expect(css).toContain('p{color:red !important;font-size:14px !important}');
  });

  it('includes prelude (e.g. @font-face) outside the layer', () => {
    const css = buildCss({
      layerName: 'adaptive-ui',
      prelude: '@font-face { font-family: "X"; src: local("X"); }',
      rules: [{ selector: 'body', declarations: { 'font-family': 'X' } }],
    });
    expect(css.indexOf('@font-face')).toBeLessThan(css.indexOf('@layer adaptive-ui{'));
  });

  it('emits nothing inside the layer block when there are no rules', () => {
    const css = buildCss({ layerName: 'adaptive-ui', rules: [] });
    expect(css).not.toContain('@layer adaptive-ui{');
  });
});
