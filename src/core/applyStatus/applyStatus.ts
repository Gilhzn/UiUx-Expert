import type { TransformId } from '../storage/types';

export interface ApplyChange {
  kind: 'tier0' | 'custom-rule' | 'sticky-bar' | 'blueprint-hide' | 'blueprint-reorder';
  label: string;
  id?: string;
}

export interface ApplyStatus {
  origin: string;
  tabId?: number;
  timestamp: number;
  enabled: boolean;
  activeTransforms: TransformId[];
  customRulesApplied: number;
  blueprintHide: number;
  blueprintReorder: number;
  stickyBarsHidden: number;
  verifierIssues: string[];
  changes: ApplyChange[];
}

export function emptyStatus(origin: string): ApplyStatus {
  return {
    origin,
    timestamp: Date.now(),
    enabled: false,
    activeTransforms: [],
    customRulesApplied: 0,
    blueprintHide: 0,
    blueprintReorder: 0,
    stickyBarsHidden: 0,
    verifierIssues: [],
    changes: [],
  };
}
