/**
 * Tier 1 reorder: apply CSS `order` to flex/grid children, and sync the
 * tab-order via tabindex so keyboard navigation matches the new visual
 * order. Falls back to no-op if the same-flex-parent invariant fails.
 */

import { findBestMatch, scoreMatch } from '../selectors/resilientSelector';
import type { SelectorAnchor } from '../selectors/resilientSelector';

const MARK_ATTR = 'data-adaptiveui-reorder';

export interface ReorderRule {
  id: string;
  anchor: SelectorAnchor;
  parentAnchor?: SelectorAnchor;
  targetOrder: number;
}

export interface Tier1ApplyResult {
  applied: number;
  total: number;
  skipped: { ruleId: string; reason: string }[];
}

export function applyTier1Reorders(rules: ReorderRule[]): Tier1ApplyResult {
  const result: Tier1ApplyResult = { applied: 0, total: rules.length, skipped: [] };

  const activeIds = new Set(rules.map((r) => r.id));
  const previouslyMarked = Array.from(document.querySelectorAll(`[${MARK_ATTR}]`));
  const parentsTouched = new Set<Element>();
  for (const el of previouslyMarked) {
    const id = el.getAttribute(MARK_ATTR);
    if (id && !activeIds.has(id)) {
      if (el.parentElement) parentsTouched.add(el.parentElement);
      revertReorder(el as HTMLElement);
    }
  }
  for (const p of parentsTouched) syncTabOrder(p, /* restore */ true);

  if (rules.length === 0) return result;

  const byParent = new Map<Element, ReorderRule[]>();
  const matchedElements = new Map<string, { el: HTMLElement; rule: ReorderRule }>();

  for (const rule of rules) {
    const match = findBestMatch(rule.anchor, document, 0.7);
    if (!match) {
      result.skipped.push({ ruleId: rule.id, reason: 'anchor not found' });
      continue;
    }
    const el = match.el as HTMLElement;
    const parent = el.parentElement;
    if (!parent) {
      result.skipped.push({ ruleId: rule.id, reason: 'no parent' });
      continue;
    }
    if (rule.parentAnchor && scoreMatch(parent, rule.parentAnchor) < 0.6) {
      result.skipped.push({ ruleId: rule.id, reason: 'parent anchor drift' });
      continue;
    }
    const cs = getComputedStyle(parent);
    const display = cs.display;
    const isFlex = display === 'flex' || display === 'inline-flex';
    const isGrid = display === 'grid' || display === 'inline-grid';
    if (!isFlex && !isGrid) {
      result.skipped.push({
        ruleId: rule.id,
        reason: `parent is ${display}, not flex/grid`,
      });
      continue;
    }
    matchedElements.set(rule.id, { el, rule });
    const list = byParent.get(parent) ?? [];
    list.push(rule);
    byParent.set(parent, list);
  }

  for (const [parent, parentRules] of byParent.entries()) {
    for (const rule of parentRules) {
      const entry = matchedElements.get(rule.id);
      if (!entry) continue;
      const el = entry.el;
      if (el.getAttribute(MARK_ATTR) === rule.id) {
        result.applied += 1;
        continue;
      }
      el.dataset['adaptiveuiPrevOrder'] = el.style.getPropertyValue('order');
      el.dataset['adaptiveuiPrevOrderPriority'] = el.style.getPropertyPriority('order');
      el.style.setProperty('order', String(rule.targetOrder), 'important');
      el.setAttribute(MARK_ATTR, rule.id);
      result.applied += 1;
    }
    syncTabOrder(parent);
  }

  return result;
}

export function clearTier1Reorders(): void {
  const reordered = Array.from(document.querySelectorAll(`[${MARK_ATTR}]`));
  const parents = new Set<Element>();
  for (const el of reordered) {
    if (el.parentElement) parents.add(el.parentElement);
    revertReorder(el as HTMLElement);
  }
  for (const p of parents) syncTabOrder(p, /* restore */ true);
}

function revertReorder(el: HTMLElement): void {
  const prev = el.dataset['adaptiveuiPrevOrder'] ?? '';
  const prio = el.dataset['adaptiveuiPrevOrderPriority'] ?? '';
  if (prev) {
    el.style.setProperty('order', prev, prio);
  } else {
    el.style.removeProperty('order');
  }
  delete el.dataset['adaptiveuiPrevOrder'];
  delete el.dataset['adaptiveuiPrevOrderPriority'];
  el.removeAttribute(MARK_ATTR);
}

const TABINDEX_SYNC_ATTR = 'data-adaptiveui-tabindex-sync';
const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]';

function syncTabOrder(parent: Element, restore = false): void {
  const children = Array.from(parent.children) as HTMLElement[];

  if (restore) {
    for (const child of children) {
      restoreInteractiveTabindex(child);
      for (const inner of Array.from(child.querySelectorAll<HTMLElement>(INTERACTIVE))) {
        restoreInteractiveTabindex(inner);
      }
    }
    return;
  }

  // Sort children by computed CSS `order`, then by original DOM order.
  const ordered = children
    .map((child, idx) => ({
      el: child,
      order: parseInt(getComputedStyle(child).order || '0', 10) || 0,
      idx,
    }))
    .sort((a, b) => (a.order - b.order) || (a.idx - b.idx));

  // Within each visually-reordered child, propagate tabindex so its
  // interactive descendants stay reachable in the new visual order.
  let tabPos = 1;
  for (const entry of ordered) {
    const root = entry.el;
    const candidates: HTMLElement[] = [];
    if (root.matches(INTERACTIVE)) candidates.push(root);
    for (const inner of Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE))) {
      candidates.push(inner);
    }
    for (const el of candidates) {
      if (Number(el.getAttribute('tabindex') ?? '0') < 0) continue;
      saveOriginalTabindex(el);
      el.setAttribute('tabindex', String(tabPos));
      tabPos += 1;
    }
  }
}

function saveOriginalTabindex(el: HTMLElement): void {
  if (el.hasAttribute(TABINDEX_SYNC_ATTR)) return;
  const original = el.hasAttribute('tabindex') ? el.getAttribute('tabindex') ?? '' : '__none__';
  el.setAttribute(TABINDEX_SYNC_ATTR, original);
}

function restoreInteractiveTabindex(el: HTMLElement): void {
  const original = el.getAttribute(TABINDEX_SYNC_ATTR);
  if (original === null) return;
  if (original === '__none__') {
    el.removeAttribute('tabindex');
  } else {
    el.setAttribute('tabindex', original);
  }
  el.removeAttribute(TABINDEX_SYNC_ATTR);
}

export { MARK_ATTR as TIER1_MARK_ATTR };
