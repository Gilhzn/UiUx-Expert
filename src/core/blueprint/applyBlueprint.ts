import type { Blueprint, BlueprintTransform } from './types';
import type { CustomRule } from '../storage/types';
import type { ReorderRule } from '../engine/tier1Reorder';

const BLUEPRINT_RULE_PREFIX = 'bp:';

export function blueprintHideRules(bp: Blueprint, origin: string): CustomRule[] {
  return bp.transforms
    .filter((t) => t.action === 'hide')
    .map((t) => ({
      id: BLUEPRINT_RULE_PREFIX + t.id,
      origin,
      anchor: t.anchor,
      action: 'hide' as const,
      source: 'suggestion' as const,
      createdAt: bp.metadata.createdAt || Date.now(),
    }));
}

export function blueprintReorderRules(bp: Blueprint): ReorderRule[] {
  return bp.transforms
    .filter((t): t is BlueprintTransform & { action: 'reorder'; targetOrder: number } =>
      t.action === 'reorder' && typeof t.targetOrder === 'number',
    )
    .map((t) => ({
      id: BLUEPRINT_RULE_PREFIX + t.id,
      anchor: t.anchor,
      parentAnchor: t.parentAnchor,
      targetOrder: t.targetOrder,
    }));
}

export function isBlueprintRuleId(ruleId: string): boolean {
  return ruleId.startsWith(BLUEPRINT_RULE_PREFIX);
}
