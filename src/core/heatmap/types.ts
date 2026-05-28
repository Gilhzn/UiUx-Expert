import type { SelectorAnchor } from '../selectors/resilientSelector';

export interface HeatmapElementSignal {
  anchor: SelectorAnchor;
  visibilityMs: number;
  clicks: number;
  selections: number;
  interactions: number;
  lastSeen: number;
}

export interface RouteHeatmap {
  route: string;
  sessions: number;
  totalActiveMs: number;
  elements: HeatmapElementSignal[];
  updatedAt: number;
}

export interface Suggestion {
  id: string;
  routeKey: string;
  anchor: SelectorAnchor;
  reason: string;
  description: string;
  action: 'hide';
  confidence: number;
  stats: {
    visibilityMs: number;
    interactions: number;
    sessions: number;
    visibilityRatio: number;
  };
}
