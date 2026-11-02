export type MapRect = { mapX: number; mapY: number; mapW: number; mapH: number };

function hash(seed: string): number {
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic point inside an area's rectangle on the stylised operations map.
 * Real geocoding is out of scope for Phase 1; this places new addresses plausibly.
 */
export function pointInArea(area: MapRect, seed: string): { mapX: number; mapY: number } {
  const h = hash(seed);
  const fx = 0.12 + (((h & 0xffff) / 0xffff) * 0.76);
  const fy = 0.12 + ((((h >>> 16) & 0xffff) / 0xffff) * 0.76);
  return { mapX: area.mapX + area.mapW * fx, mapY: area.mapY + area.mapH * fy };
}
