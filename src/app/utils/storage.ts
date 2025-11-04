import { BusStop } from '../types';

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
    return parsed.map(migrateBusStop);
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

