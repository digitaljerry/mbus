import { BusStop, StopRoute } from '../types';
import { DEFAULT_STOPS } from '../lib/defaults';
import { cleanUsualBus, type UsualBus } from '../lib/usual';

const STORAGE_KEY = 'mbus-pinned-stops';

// Old format interface for migration
interface OldBusStop {
  id: string;
  name: string;
  stopId?: string;
  route?: string;
  stops?: Array<{ stopId: string; route: string }>;
  description?: string;
}

// Migration: Convert old format (single stopId/route) to new format (array of stops)
function migrateBusStop(stop: OldBusStop | BusStop): BusStop {
  // If it already has the new format (stops array), return as-is
  if ('stops' in stop && Array.isArray(stop.stops) && stop.stops.length > 0) {
    return stop as BusStop;
  }
  
  // Otherwise, migrate from old format
  if ('stopId' in stop && 'route' in stop && stop.stopId && stop.route) {
    return {
      id: stop.id,
      name: stop.name,
      stops: [{ stopId: stop.stopId, route: stop.route }],
      description: stop.description
    };
  }
  
  // Fallback for malformed data - return minimal valid BusStop
  return {
    id: stop.id || `stop-${Date.now()}`,
    name: stop.name || 'Unknown',
    stops: []
  };
}

// Fixes for stops the original default journeys got wrong:
// - 327 (Streliška, towards Pohorje) isn't served by P18 at all.
// - At OŠ Ludvika Pliberška, P18 leaves 242 towards Pekre (home) and 243
//   towards the city; the defaults had them the other way round.
function fixKnownBadStops(stop: BusStop): BusStop {
  const isP18 = (s: StopRoute) => s.route.toUpperCase() === 'P18';
  let stops = stop.stops.map(s => (s.stopId === '327' && isP18(s) ? { ...s, stopId: '242' } : s));
  if (stop.id === 'school-to-home') stops = stops.map(s => (s.stopId === '243' && isP18(s) ? { ...s, stopId: '242' } : s));
  if (stop.id === 'school-to-city') stops = stops.map(s => (s.stopId === '242' && isP18(s) ? { ...s, stopId: '243' } : s));
  // Give default journeys their destination stop (for arrival times) unless set.
  const preset = DEFAULT_STOPS.find(d => d.id === stop.id);
  if (preset) {
    stops = stops.map(s => {
      if (s.toStopId) return s;
      const match = preset.stops.find(p => p.stopId === s.stopId && p.route === s.route.toUpperCase());
      return match?.toStopId ? { ...s, toStopId: match.toStopId } : s;
    });
  }
  return { ...stop, stops };
}

export function loadPinnedStops(): BusStop[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as (OldBusStop | BusStop)[];
    // Migrate old format to new format
    return parsed.map(migrateBusStop).map(fixKnownBadStops);
  } catch (error) {
    console.error('Error loading pinned stops from localStorage:', error);
    return [];
  }
}

export function savePinnedStops(stops: BusStop[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stops));
  } catch (error) {
    console.error('Error saving pinned stops to localStorage:', error);
  }
}

export function addPinnedStop(stop: BusStop): void {
  const stops = loadPinnedStops();
  // Check if stop with same id already exists
  if (stops.some(s => s.id === stop.id)) {
    return;
  }
  stops.push(stop);
  savePinnedStops(stops);
}

export function updatePinnedStop(id: string, updates: Partial<BusStop>): void {
  const stops = loadPinnedStops();
  const index = stops.findIndex(s => s.id === id);
  if (index === -1) {
    return;
  }
  stops[index] = { ...stops[index], ...updates };
  savePinnedStops(stops);
}

export function removePinnedStop(id: string): void {
  const stops = loadPinnedStops();
  const filtered = stops.filter(s => s.id !== id);
  savePinnedStops(filtered);
}

export function clearPinnedStops(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing pinned stops from localStorage:', error);
  }
}


// ---------------------------------------------------------------------------
// Usual buses

const USUAL_KEY = 'mbus-usual-buses';

export function loadUsualBuses(): UsualBus[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(USUAL_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.map(cleanUsualBus).filter((u): u is UsualBus => u !== null) : [];
  } catch {
    return [];
  }
}

export function saveUsualBuses(list: UsualBus[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USUAL_KEY, JSON.stringify(list));
  } catch (error) {
    console.error('Error saving usual buses:', error);
  }
}
