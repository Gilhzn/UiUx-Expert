import type { Blueprint, CachedBlueprint } from './types';

const BLUEPRINT_PREFIX = 'blueprint:';
export const QUARANTINE_THRESHOLD = 2;

export function blueprintStorageKey(structuralHash: string): string {
  return BLUEPRINT_PREFIX + structuralHash;
}

export function isBlueprintStorageKey(key: string): boolean {
  return key.startsWith(BLUEPRINT_PREFIX);
}

export async function loadCachedBlueprint(
  structuralHash: string,
): Promise<CachedBlueprint | null> {
  const key = blueprintStorageKey(structuralHash);
  const raw = await chrome.storage.local.get(key);
  return (raw[key] as CachedBlueprint | undefined) ?? null;
}

export async function saveCachedBlueprint(entry: CachedBlueprint): Promise<void> {
  await chrome.storage.local.set({
    [blueprintStorageKey(entry.blueprint.structuralHash)]: entry,
  });
}

export async function recordBlueprintFailure(structuralHash: string): Promise<CachedBlueprint | null> {
  const entry = await loadCachedBlueprint(structuralHash);
  if (!entry) return null;
  entry.verifierFailures += 1;
  if (entry.verifierFailures >= QUARANTINE_THRESHOLD) entry.quarantined = true;
  await saveCachedBlueprint(entry);
  return entry;
}

export async function freshCachedBlueprint(bp: Blueprint): Promise<CachedBlueprint> {
  const entry: CachedBlueprint = {
    blueprint: bp,
    fetchedAt: Date.now(),
    verifierFailures: 0,
    quarantined: false,
  };
  await saveCachedBlueprint(entry);
  return entry;
}
