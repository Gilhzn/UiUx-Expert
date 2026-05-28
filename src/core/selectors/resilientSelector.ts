export interface SelectorAnchor {
  tag: string;
  role: string | null;
  ariaLabel: string | null;
  accessibleName: string | null;
  classFingerprint: string;
  structuralPath: string;
}

export function buildAnchor(el: Element): SelectorAnchor {
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    accessibleName: accessibleNameOf(el),
    classFingerprint: classFingerprint(el),
    structuralPath: structuralPath(el),
  };
}

export function anchorKey(anchor: SelectorAnchor): string {
  return [
    anchor.tag,
    anchor.role ?? '',
    anchor.ariaLabel ?? '',
    anchor.accessibleName ?? '',
    anchor.classFingerprint,
    anchor.structuralPath,
  ].join('|');
}

export function findBestMatch(
  anchor: SelectorAnchor,
  scope: ParentNode = document,
  minScore = 0.5,
): { el: Element; score: number } | null {
  let candidates: Element[];
  try {
    candidates = Array.from(scope.querySelectorAll(anchor.tag));
  } catch {
    return null;
  }
  let best: { el: Element; score: number } | null = null;
  for (const el of candidates) {
    const score = scoreMatch(el, anchor);
    if (score >= minScore && (!best || score > best.score)) {
      best = { el, score };
    }
  }
  return best;
}

export function scoreMatch(el: Element, anchor: SelectorAnchor): number {
  let max = 0;
  let got = 0;

  const wTag = 1;
  max += wTag;
  if (el.tagName.toLowerCase() === anchor.tag) got += wTag;

  if (anchor.role !== null) {
    const w = 1.5;
    max += w;
    if (el.getAttribute('role') === anchor.role) got += w;
  }
  if (anchor.ariaLabel !== null) {
    const w = 1.5;
    max += w;
    if (el.getAttribute('aria-label') === anchor.ariaLabel) got += w;
  }
  if (anchor.accessibleName !== null) {
    const w = 2;
    max += w;
    const name = accessibleNameOf(el);
    if (name === anchor.accessibleName) got += w;
    else if (
      name &&
      (name.includes(anchor.accessibleName) || anchor.accessibleName.includes(name))
    )
      got += w / 2;
  }
  if (anchor.classFingerprint !== '') {
    const w = 1;
    max += w;
    if (classFingerprint(el) === anchor.classFingerprint) got += w;
  }

  const wStruct = 1.5;
  max += wStruct;
  if (structuralPath(el) === anchor.structuralPath) got += wStruct;

  return max === 0 ? 0 : got / max;
}

function accessibleNameOf(el: Element): string | null {
  const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return txt.length > 0 ? txt : null;
}

function classFingerprint(el: Element): string {
  const cls = el.getAttribute('class') ?? '';
  const tokens = cls
    .split(/\s+/)
    .filter(
      (c) =>
        c.length > 0 &&
        !/^[a-z]{1,3}-\d+$/i.test(c) &&
        !/^_[a-zA-Z0-9_-]{6,}$/.test(c) &&
        !/^css-[a-f0-9]{6,}$/.test(c),
    )
    .sort()
    .join('|');
  return tokens ? hash(tokens).toString(36) : '';
}

function structuralPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.parentElement && depth < 6) {
    const idx = Array.from(cur.parentElement.children).indexOf(cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join('>');
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}
