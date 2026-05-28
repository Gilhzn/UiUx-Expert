import type { Blueprint } from './types';
import type { CustomRule } from '../storage/types';

const BLUEPRINT_RULE_PREFIX = 'bp:';

export function blueprintToCustomRules(bp: Blueprint, origin: string): CustomRule[] {
  return bp.transforms.map((t) => ({
    id: BLUEPRINT_RULE_PREFIX + t.id,
    origin,
    anchor: t.anchor,
    action: t.action,
    source: 'suggestion',
    createdAt: bp.metadata.createdAt || Date.now(),
  }));
}

export function isBlueprintRuleId(ruleId: string): boolean {
  return ruleId.startsWith(BLUEPRINT_RULE_PREFIX);
}
