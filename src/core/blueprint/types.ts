import type { SelectorAnchor } from '../selectors/resilientSelector';

export interface BlueprintTransform {
  id: string;
  anchor: SelectorAnchor;
  action: 'hide' | 'reorder';
  /** Required when action === 'reorder' — the CSS `order` value to apply. */
  targetOrder?: number;
  /** Required when action === 'reorder' — the parent that should contain
   *  the element AND all of its reorder siblings. Used to enforce the
   *  "same flex/grid container" invariant. */
  parentAnchor?: SelectorAnchor;
  reason?: string;
}

export interface BlueprintMetadata {
  createdAt: number;
  model?: string;
  source?: 'cache' | 'llm' | 'heuristic';
}

export interface Blueprint {
  version: 1;
  structuralHash: string;
  transforms: BlueprintTransform[];
  metadata: BlueprintMetadata;
}

export interface BlueprintResponse {
  blueprint: Blueprint;
  source: 'cache' | 'llm' | 'heuristic';
}

export interface CachedBlueprint {
  blueprint: Blueprint;
  fetchedAt: number;
  verifierFailures: number;
  quarantined: boolean;
}

export function isBlueprint(value: unknown): value is Blueprint {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (typeof v.structuralHash !== 'string') return false;
  if (!Array.isArray(v.transforms)) return false;
  for (const t of v.transforms) {
    if (!t || typeof t !== 'object') return false;
    const tr = t as Record<string, unknown>;
    if (typeof tr.id !== 'string') return false;
    if (tr.action !== 'hide' && tr.action !== 'reorder') return false;
    if (!tr.anchor || typeof tr.anchor !== 'object') return false;
    const a = tr.anchor as Record<string, unknown>;
    if (typeof a.tag !== 'string') return false;
    if (typeof a.structuralPath !== 'string') return false;
    if (typeof a.classFingerprint !== 'string') return false;
    if (tr.action === 'reorder') {
      if (typeof tr.targetOrder !== 'number') return false;
    }
  }
  return true;
}
