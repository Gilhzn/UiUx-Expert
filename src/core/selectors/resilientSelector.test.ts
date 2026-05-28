import { describe, it, expect, beforeEach } from 'vitest';
import { buildAnchor, scoreMatch } from './resilientSelector';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resilientSelector', () => {
  it('scores a perfect self-match at 1.0', () => {
    document.body.innerHTML = `<button aria-label="Buy" class="cta-primary">Buy now</button>`;
    const el = document.querySelector('button')!;
    const anchor = buildAnchor(el);
    expect(scoreMatch(el, anchor)).toBe(1);
  });

  it('scores lower when text and aria-label changed', () => {
    document.body.innerHTML = `<button aria-label="Buy" class="cta-primary">Buy</button>`;
    const original = document.querySelector('button')!;
    const anchor = buildAnchor(original);

    document.body.innerHTML = `<button aria-label="Add to cart" class="cta-primary">Add</button>`;
    const drifted = document.querySelector('button')!;
    const score = scoreMatch(drifted, anchor);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('partial accessible-name match still scores some credit', () => {
    document.body.innerHTML = `<a>Open settings</a>`;
    const original = document.querySelector('a')!;
    const anchor = buildAnchor(original);

    document.body.innerHTML = `<a>Open</a>`;
    const drifted = document.querySelector('a')!;
    expect(scoreMatch(drifted, anchor)).toBeGreaterThan(0);
  });
});
