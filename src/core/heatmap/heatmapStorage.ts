import type { RouteHeatmap } from './types';

const HEATMAP_PREFIX = 'heatmap:';

export function heatmapStorageKey(routeKey: string): string {
  return HEATMAP_PREFIX + routeKey;
}

export function isHeatmapStorageKey(key: string): boolean {
  return key.startsWith(HEATMAP_PREFIX);
}

export async function loadRouteHeatmap(routeKey: string): Promise<RouteHeatmap | null> {
  const key = heatmapStorageKey(routeKey);
  const raw = await chrome.storage.local.get(key);
  return (raw[key] as RouteHeatmap | undefined) ?? null;
}

export async function saveRouteHeatmap(data: RouteHeatmap): Promise<void> {
  const key = heatmapStorageKey(data.route);
  await chrome.storage.local.set({ [key]: data });
}

export async function deleteRouteHeatmap(routeKey: string): Promise<void> {
  await chrome.storage.local.remove(heatmapStorageKey(routeKey));
}

export async function listRouteHeatmaps(): Promise<RouteHeatmap[]> {
  const all = await chrome.storage.local.get(null);
  const out: RouteHeatmap[] = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(HEATMAP_PREFIX) && v) out.push(v as RouteHeatmap);
  }
  return out;
}
