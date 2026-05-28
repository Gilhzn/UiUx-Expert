/**
 * Runtime detector for sticky / fixed promotional bars.
 *
 * Pure CSS heuristics catch named patterns; this pass catches the long tail
 * via computed-style + geometry: position:fixed/sticky elements that span
 * (near) the full viewport width and are short, anchored to top or bottom.
 *
 * Hides matches via inline display:none !important + a marker attribute so
 * the change is fully reversible (see clearStickyBars).
 */

const MARK_ATTR = 'data-adaptiveui-sticky-bar';

export interface StickyBarOptions {
  /** Element must occupy at least this fraction of the viewport width. */
  minWidthRatio?: number;
  /** Element must be at most this fraction of the viewport height. */
  maxHeightRatio?: number;
  /** Element must be within this many px from the top or bottom edge. */
  edgeProximityPx?: number;
}

const DEFAULTS: Required<StickyBarOptions> = {
  minWidthRatio: 0.85,
  maxHeightRatio: 0.3,
  edgeProximityPx: 16,
};

const SKIP_TAGS = new Set(['HTML', 'BODY', 'MAIN', 'ARTICLE', 'NAV']);

export interface StickyBarApplyResult {
  hidden: number;
}

export function applyStickyBars(opts: StickyBarOptions = {}): StickyBarApplyResult {
  const o = { ...DEFAULTS, ...opts };
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (vw === 0 || vh === 0) return { hidden: 0 };

  let hidden = 0;
  const seen = new WeakSet<Element>();

  const candidates = collectCandidates();
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (el.hasAttribute(MARK_ATTR)) {
      hidden++;
      continue;
    }
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < vw * o.minWidthRatio) continue;
    if (rect.height === 0 || rect.height > vh * o.maxHeightRatio) continue;

    const nearTop = rect.top <= o.edgeProximityPx;
    const nearBottom = vh - rect.bottom <= o.edgeProximityPx;
    if (!nearTop && !nearBottom) continue;

    if (containsMainContent(el)) continue;

    hide(el as HTMLElement);
    hidden++;
  }
  return { hidden };
}

export function clearStickyBars(): void {
  for (const el of Array.from(document.querySelectorAll(`[${MARK_ATTR}]`))) {
    revert(el as HTMLElement);
  }
}

function collectCandidates(): Element[] {
  const out: Element[] = [];
  // Cheap heuristic: walk only the top two layers of body's subtree where
  // sticky bars almost always live. Anything deeper is unlikely to be one.
  const root = document.body;
  if (!root) return out;
  for (const child of Array.from(root.children)) {
    out.push(child);
    if (out.length > 200) break;
    for (const grand of Array.from(child.children)) {
      out.push(grand);
      if (out.length > 200) break;
    }
  }
  return out;
}

function containsMainContent(el: Element): boolean {
  return Boolean(el.querySelector('main, article, [role="main"]'));
}

function hide(el: HTMLElement): void {
  el.setAttribute(MARK_ATTR, '1');
  el.dataset['adaptiveuiStickyPrevDisplay'] = el.style.getPropertyValue('display');
  el.dataset['adaptiveuiStickyPrevPriority'] = el.style.getPropertyPriority('display');
  el.style.setProperty('display', 'none', 'important');
}

function revert(el: HTMLElement): void {
  const prev = el.dataset['adaptiveuiStickyPrevDisplay'] ?? '';
  const prio = el.dataset['adaptiveuiStickyPrevPriority'] ?? '';
  if (prev) {
    el.style.setProperty('display', prev, prio);
  } else {
    el.style.removeProperty('display');
  }
  delete el.dataset['adaptiveuiStickyPrevDisplay'];
  delete el.dataset['adaptiveuiStickyPrevPriority'];
  el.removeAttribute(MARK_ATTR);
}

export { MARK_ATTR as STICKY_BAR_MARK_ATTR };
