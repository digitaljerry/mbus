// Official Marprom line colours (as published in the GTFS feed via brezavta).
// The API also returns colours live; this table is the fallback when it can't.
const ROUTE_COLORS: Record<string, string> = {
  G1: '#323033',
  G2: '#88A1A9',
  G3: '#6F3A96',
  G4: '#1C3564',
  G5: '#DA70D6',
  G6: '#1A6734',
  P7: '#8A181A',
  P8: '#8EB3DF',
  P10: '#7BC258',
  P11: '#D5DA76',
  P12: '#1480C1',
  P15: '#60C3AC',
  P16: '#D5137B',
  P18: '#C07E65',
};

const FALLBACK = '#475569';

export function routeColor(route: string): string {
  return ROUTE_COLORS[route.toUpperCase()] ?? FALLBACK;
}

/** Black or white, whichever reads better on the given hex background. */
export function readableTextOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.62 ? '#111827' : '#FFFFFF';
}
