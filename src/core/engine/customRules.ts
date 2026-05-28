import { findBestMatch } from '../selectors/resilientSelector';
import type { CustomRule } from '../storage/types';

const APPLIED_ATTR = 'data-adaptiveui-rule';

export interface CustomRuleApplyResult {
  applied: number;
  total: number;
  unmatched: string[];
}

export function applyCustomRules(rules: CustomRule[]): CustomRuleApplyResult {
  const seen = new Set<string>();
  for (const el of Array.from(document.querySelectorAll(`[${APPLIED_ATTR}]`))) {
    seen.add(el.getAttribute(APPLIED_ATTR) ?? '');
  }

  const activeIds = new Set(rules.map((r) => r.id));
  for (const el of Array.from(document.querySelectorAll(`[${APPLIED_ATTR}]`))) {
    const id = el.getAttribute(APPLIED_ATTR);
    if (id && !activeIds.has(id)) revertRuleOnElement(el as HTMLElement);
  }

  let applied = 0;
  const unmatched: string[] = [];
  for (const rule of rules) {
    if (seen.has(rule.id)) {
      applied += 1;
      continue;
    }
    const match = findBestMatch(rule.anchor, document, 0.7);
    if (!match) {
      unmatched.push(rule.id);
      continue;
    }
    applyRuleToElement(match.el as HTMLElement, rule);
    applied += 1;
  }
  return { applied, total: rules.length, unmatched };
}

export function clearCustomRules(): void {
  for (const el of Array.from(document.querySelectorAll(`[${APPLIED_ATTR}]`))) {
    revertRuleOnElement(el as HTMLElement);
  }
}

function applyRuleToElement(el: HTMLElement, rule: CustomRule): void {
  el.setAttribute(APPLIED_ATTR, rule.id);
  if (rule.action === 'hide') {
    el.dataset['adaptiveuiPrevDisplay'] = el.style.getPropertyValue('display');
    el.dataset['adaptiveuiPrevPriority'] = el.style.getPropertyPriority('display');
    el.style.setProperty('display', 'none', 'important');
  }
}

function revertRuleOnElement(el: HTMLElement): void {
  const prev = el.dataset['adaptiveuiPrevDisplay'] ?? '';
  const prio = el.dataset['adaptiveuiPrevPriority'] ?? '';
  if (prev) {
    el.style.setProperty('display', prev, prio);
  } else {
    el.style.removeProperty('display');
  }
  delete el.dataset['adaptiveuiPrevDisplay'];
  delete el.dataset['adaptiveuiPrevPriority'];
  el.removeAttribute(APPLIED_ATTR);
}
