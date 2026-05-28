import { buildCss } from './cssBuilder';
import { runTransforms } from './transforms';
import type { ResolvedSettings, TransformId } from '../storage/types';

const STYLE_ID = 'adaptive-ui-style';
const LAYER_NAME = 'adaptive-ui';

export interface ApplyResult {
  ok: boolean;
  applied: TransformId[];
  reason?: string;
}

export function applyTransforms(settings: ResolvedSettings): ApplyResult {
  if (!settings.enabled) {
    removeStyle();
    return { ok: true, applied: [], reason: 'disabled' };
  }
  const active = (Object.keys(settings.transforms) as TransformId[]).filter(
    (id) => settings.transforms[id],
  );
  if (active.length === 0) {
    removeStyle();
    return { ok: true, applied: [] };
  }
  const out = runTransforms(active, settings.uxDna);
  if (out.rules.length === 0 && !out.prelude) {
    removeStyle();
    return { ok: true, applied: [] };
  }
  const css = buildCss({ layerName: LAYER_NAME, prelude: out.prelude, rules: out.rules });
  injectStyle(css);
  return { ok: true, applied: active };
}

export function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function injectStyle(css: string): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    if (document.head) {
      document.head.prepend(el);
    } else {
      document.documentElement.prepend(el);
      const observer = new MutationObserver(() => {
        if (document.head && el && el.parentElement !== document.head) {
          document.head.prepend(el);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }
  }
  if (el.textContent !== css) {
    el.textContent = css;
  }
}

export { STYLE_ID, LAYER_NAME };
