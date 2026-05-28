export interface SkeletonNode {
  t: string;
  r?: string;
  a?: '1';
  c?: string;
  s?: 's' | 'm' | 'l' | 'xl';
  k?: number;
  ch?: SkeletonNode[];
}

export interface SkeletonResult {
  root: SkeletonNode;
  hash: string;
  nodes: number;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'TEMPLATE']);

export function skeletonize(root: Element): SkeletonResult {
  let count = 0;

  const visit = (el: Element): SkeletonNode => {
    count++;
    const node: SkeletonNode = { t: el.tagName.toLowerCase() };
    const role = el.getAttribute('role');
    if (role) node.r = role;
    if (el.hasAttribute('aria-label')) node.a = '1';
    const cls = el.getAttribute('class');
    if (cls) {
      const fp = classFingerprint(cls);
      if (fp) node.c = fp;
    }
    let textLen = 0;
    const children: SkeletonNode[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        textLen += (child.textContent ?? '').trim().length;
      } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
        const childEl = child as Element;
        if (SKIP_TAGS.has(childEl.tagName)) continue;
        children.push(visit(childEl));
      }
    }
    if (textLen > 0) node.s = bucket(textLen);
    if (children.length > 0) {
      node.ch = children;
      node.k = children.length;
    }
    return node;
  };

  const skeletonRoot = visit(root);
  return {
    root: skeletonRoot,
    hash: structuralHash(skeletonRoot).toString(36),
    nodes: count,
  };
}

function bucket(n: number): 's' | 'm' | 'l' | 'xl' {
  if (n < 20) return 's';
  if (n < 100) return 'm';
  if (n < 500) return 'l';
  return 'xl';
}

function classFingerprint(cls: string): string {
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

function structuralHash(n: SkeletonNode): number {
  let h = hash(n.t + (n.r ?? '') + String(n.k ?? 0));
  if (n.ch) for (const c of n.ch) h = (((h * 31) >>> 0) + structuralHash(c)) >>> 0;
  return h;
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}
