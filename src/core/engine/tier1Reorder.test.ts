import { describe, it, expect, beforeEach } from 'vitest';
import { applyTier1Reorders, clearTier1Reorders } from './tier1Reorder';
import { buildAnchor } from '../selectors/resilientSelector';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Tier 1 reorder', () => {
  function setup(displayParent: string) {
    document.body.innerHTML = `
      <div id="container" style="display:${displayParent}">
        <div class="a"><button>A</button></div>
        <div class="b"><button>B</button></div>
        <div class="c"><button>C</button></div>
      </div>
    `;
  }

  it('applies CSS order via inline style on a flex parent', () => {
    setup('flex');
    const target = document.querySelector('.c')!;
    const anchor = buildAnchor(target);
    const result = applyTier1Reorders([
      { id: 'r1', anchor, targetOrder: -1 },
    ]);
    expect(result.applied).toBe(1);
    expect(result.skipped).toEqual([]);
    expect((target as HTMLElement).style.order).toBe('-1');
  });

  it('skips when parent is not flex/grid', () => {
    setup('block');
    const target = document.querySelector('.c')!;
    const anchor = buildAnchor(target);
    const result = applyTier1Reorders([
      { id: 'r1', anchor, targetOrder: 0 },
    ]);
    expect(result.applied).toBe(0);
    expect(result.skipped[0]?.reason).toMatch(/not flex\/grid/);
  });

  it('also works on a grid parent', () => {
    setup('grid');
    const target = document.querySelector('.b')!;
    const anchor = buildAnchor(target);
    const result = applyTier1Reorders([{ id: 'r1', anchor, targetOrder: 99 }]);
    expect(result.applied).toBe(1);
    expect((target as HTMLElement).style.order).toBe('99');
  });

  it('syncs tabindex on interactive descendants in visual order', () => {
    setup('flex');
    const c = document.querySelector('.c')!;
    const anchor = buildAnchor(c);
    applyTier1Reorders([{ id: 'r1', anchor, targetOrder: -1 }]);
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLElement[];
    const cBtn = c.querySelector('button') as HTMLElement;
    // The reordered child's button should be the first in tab-order.
    expect(cBtn.getAttribute('tabindex')).toBe('1');
    expect(buttons.length).toBe(3);
  });

  it('reverts cleanly on clear', () => {
    setup('flex');
    const target = document.querySelector('.c')!;
    const anchor = buildAnchor(target);
    applyTier1Reorders([{ id: 'r1', anchor, targetOrder: -1 }]);
    clearTier1Reorders();
    expect((target as HTMLElement).style.order).toBe('');
    // tabindex restored to original (none)
    expect(target.querySelector('button')?.getAttribute('tabindex')).toBeNull();
  });

  it('removes rules no longer in the active set on re-apply', () => {
    setup('flex');
    const c = document.querySelector('.c')!;
    const anchor = buildAnchor(c);
    applyTier1Reorders([{ id: 'r1', anchor, targetOrder: 5 }]);
    expect((c as HTMLElement).style.order).toBe('5');
    applyTier1Reorders([]);
    expect((c as HTMLElement).style.order).toBe('');
  });

  it('is idempotent: second apply with same rules does not duplicate', () => {
    setup('flex');
    const c = document.querySelector('.c')!;
    const anchor = buildAnchor(c);
    const first = applyTier1Reorders([{ id: 'r1', anchor, targetOrder: 5 }]);
    const second = applyTier1Reorders([{ id: 'r1', anchor, targetOrder: 5 }]);
    expect(first.applied).toBe(1);
    expect(second.applied).toBe(1);
    expect((c as HTMLElement).style.order).toBe('5');
  });
});
