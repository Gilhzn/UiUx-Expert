import { buildAnchor, anchorKey } from '../selectors/resilientSelector';
import type { SelectorAnchor } from '../selectors/resilientSelector';
import type { HeatmapElementSignal, RouteHeatmap } from './types';
import { loadRouteHeatmap, saveRouteHeatmap } from './heatmapStorage';

const LANDMARK_SELECTORS = [
  'main',
  'article',
  'section',
  'aside',
  'nav',
  'header',
  'footer',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="navigation"]',
  '[role="contentinfo"]',
  '[role="main"]',
];

const MAX_TRACKED = 50;
const IDLE_FREEZE_MS = 20_000;
const SAVE_INTERVAL_MS = 5_000;
const SCAN_INTERVAL_MS = 3_000;
const VISIBILITY_THRESHOLD = 0.2;

interface Tracked {
  el: Element;
  anchor: SelectorAnchor;
  anchorKey: string;
  signal: HeatmapElementSignal;
  visibleSince: number | null;
}

const TRACKED_KEY = Symbol('adaptiveUiTrackedKey');

type ElementWithKey = Element & { [TRACKED_KEY]?: string };

export interface HeatmapEngineHandle {
  stop(): void;
}

export async function startHeatmapEngine(routeKey: string): Promise<HeatmapEngineHandle> {
  const existing = await loadRouteHeatmap(routeKey);
  const data: RouteHeatmap = existing ?? {
    route: routeKey,
    sessions: 0,
    totalActiveMs: 0,
    elements: [],
    updatedAt: Date.now(),
  };
  data.sessions += 1;

  const signalsByKey = new Map<string, HeatmapElementSignal>();
  for (const s of data.elements) signalsByKey.set(anchorKey(s.anchor), s);

  const tracked = new Map<string, Tracked>();

  let active = true;
  let lastActivity = Date.now();
  let sessionStart = Date.now();
  let sessionAccumulatedMs = 0;

  const commitVisible = (now: number, freeze = false) => {
    for (const t of tracked.values()) {
      if (t.visibleSince !== null) {
        if (active) t.signal.visibilityMs += now - t.visibleSince;
        t.visibleSince = freeze ? null : now;
      }
    }
  };

  const io = new IntersectionObserver((entries) => {
    const now = Date.now();
    for (const entry of entries) {
      const el = entry.target as ElementWithKey;
      const key = el[TRACKED_KEY];
      if (!key) continue;
      const t = tracked.get(key);
      if (!t) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
        if (t.visibleSince === null && active) t.visibleSince = now;
      } else if (t.visibleSince !== null) {
        if (active) t.signal.visibilityMs += now - t.visibleSince;
        t.visibleSince = null;
      }
    }
  }, { threshold: [0, 0.2, 0.5, 0.8] });

  const scan = () => {
    if (tracked.size >= MAX_TRACKED) return;
    const semantic = document.querySelectorAll(LANDMARK_SELECTORS.join(','));
    const candidates: Element[] = Array.from(semantic);
    if (candidates.length < MAX_TRACKED) {
      const vh = window.innerHeight || 800;
      const all = document.body?.querySelectorAll('div, section') ?? [];
      for (const el of Array.from(all)) {
        if (candidates.length >= MAX_TRACKED) break;
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.height > vh * 0.25 && rect.width > 200) candidates.push(el);
      }
    }
    for (const rawEl of candidates) {
      if (tracked.size >= MAX_TRACKED) break;
      const el = rawEl as ElementWithKey;
      if (el[TRACKED_KEY]) continue;
      const anchor = buildAnchor(el);
      const aKey = anchorKey(anchor);
      el[TRACKED_KEY] = aKey;
      const restored = signalsByKey.get(aKey);
      const signal: HeatmapElementSignal = restored ?? {
        anchor,
        visibilityMs: 0,
        clicks: 0,
        selections: 0,
        interactions: 0,
        lastSeen: Date.now(),
      };
      signal.lastSeen = Date.now();
      signal.anchor = anchor;
      tracked.set(aKey, { el, anchor, anchorKey: aKey, signal, visibleSince: null });
      io.observe(el);
    }
  };

  const recordActivity = () => {
    lastActivity = Date.now();
    if (!active) {
      active = true;
      sessionStart = Date.now();
    }
  };

  const findClosestTracked = (target: Element | null): Tracked | null => {
    let cur: ElementWithKey | null = target as ElementWithKey | null;
    while (cur) {
      const key = cur[TRACKED_KEY];
      if (key) {
        const t = tracked.get(key);
        if (t) return t;
      }
      cur = cur.parentElement as ElementWithKey | null;
    }
    return null;
  };

  const onClick = (e: MouseEvent) => {
    recordActivity();
    const t = findClosestTracked(e.target as Element | null);
    if (t) {
      t.signal.clicks += 1;
      t.signal.interactions += 1;
    }
  };

  const onSelection = () => {
    recordActivity();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const el = container.nodeType === 1
      ? (container as Element)
      : container.parentElement;
    if (!el) return;
    const t = findClosestTracked(el);
    if (t) {
      t.signal.selections += 1;
      t.signal.interactions += 1;
    }
  };

  let moveThrottle: number | null = null;
  const onMouseMove = () => {
    if (moveThrottle !== null) return;
    moveThrottle = window.setTimeout(() => {
      moveThrottle = null;
      recordActivity();
    }, 100);
  };

  const onScroll = () => recordActivity();

  document.addEventListener('click', onClick, { capture: true, passive: true });
  document.addEventListener('selectionchange', onSelection, { passive: true });
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });

  const noiseTicker = window.setInterval(() => {
    const now = Date.now();
    if (active && now - lastActivity > IDLE_FREEZE_MS) {
      commitVisible(now, true);
      sessionAccumulatedMs += now - sessionStart;
      active = false;
    }
  }, 1000);

  const persist = async () => {
    const now = Date.now();
    commitVisible(now, false);
    if (active) {
      const delta = now - sessionStart;
      sessionAccumulatedMs += delta;
      sessionStart = now;
    }
    data.totalActiveMs += sessionAccumulatedMs;
    sessionAccumulatedMs = 0;
    data.elements = Array.from(tracked.values())
      .map((t) => t.signal)
      .sort((a, b) => b.visibilityMs - a.visibilityMs)
      .slice(0, MAX_TRACKED);
    data.updatedAt = now;
    try {
      await saveRouteHeatmap(data);
    } catch (e) {
      console.debug('[AdaptiveUI] heatmap save failed', e);
    }
  };

  const saveTicker = window.setInterval(() => {
    if (active) void persist();
  }, SAVE_INTERVAL_MS);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void persist();
      active = false;
    } else {
      sessionStart = Date.now();
      lastActivity = sessionStart;
      active = true;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const onPageHide = () => {
    void persist();
  };
  window.addEventListener('pagehide', onPageHide);

  const scanTicker = window.setInterval(scan, SCAN_INTERVAL_MS);
  let mo: MutationObserver | null = null;
  if (document.body) {
    scan();
    mo = new MutationObserver(() => {
      if (tracked.size < MAX_TRACKED) scan();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } else {
    const wait = new MutationObserver(() => {
      if (document.body) {
        wait.disconnect();
        scan();
        mo = new MutationObserver(() => {
          if (tracked.size < MAX_TRACKED) scan();
        });
        mo.observe(document.body, { childList: true, subtree: true });
      }
    });
    wait.observe(document.documentElement, { childList: true });
  }

  return {
    stop() {
      io.disconnect();
      mo?.disconnect();
      clearInterval(noiseTicker);
      clearInterval(saveTicker);
      clearInterval(scanTicker);
      document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      void persist();
    },
  };
}
