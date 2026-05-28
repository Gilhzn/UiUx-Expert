import type { VerifierIssue, VerifierReport } from '../storage/types';

export interface VerifierOptions {
  contentMinHeightPx?: number;
  maxOverflowPx?: number;
}

export function verify(opts: VerifierOptions = {}): VerifierReport {
  const issues: VerifierIssue[] = [];
  const maxOverflow = opts.maxOverflowPx ?? 4;
  const minContent = opts.contentMinHeightPx ?? 100;

  try {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    if (overflowX > maxOverflow) {
      issues.push({
        kind: 'overflow',
        detail: `horizontal overflow ${overflowX}px (scrollWidth=${doc.scrollWidth} clientWidth=${doc.clientWidth})`,
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const main =
      document.querySelector('main, [role="main"], article') ?? pickLargestVisibleBlock();
    if (main) {
      const rect = (main as HTMLElement).getBoundingClientRect();
      if (rect.height < minContent) {
        issues.push({
          kind: 'content-collapsed',
          detail: `main content height ${Math.round(rect.height)}px < ${minContent}px threshold`,
        });
      }
    }
  } catch {
    /* ignore */
  }

  const interactiveSelectors = 'a[href], button, input:not([type="hidden"]), select, textarea';
  const broken: string[] = [];
  const nodes = Array.from(document.querySelectorAll(interactiveSelectors)).slice(0, 200);
  for (const node of nodes) {
    const el = node as HTMLElement;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      broken.push(describeNode(el));
      if (broken.length > 5) break;
    }
  }
  if (broken.length > 0) {
    issues.push({
      kind: 'interactive-broken',
      detail: `interactive elements collapsed: ${broken.join('; ')}`,
    });
  }

  return { ok: issues.length === 0, issues, appliedAt: Date.now() };
}

function pickLargestVisibleBlock(): Element | null {
  const candidates = Array.from(document.body?.querySelectorAll('div, section') ?? []);
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of candidates.slice(0, 200)) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

function describeNode(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const cls =
    el.className && typeof el.className === 'string'
      ? `.${el.className.split(/\s+/)[0]}`
      : '';
  return `${tag}${id}${cls}`;
}
