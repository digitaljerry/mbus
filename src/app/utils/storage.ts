import { BusStop } from '../types';

const STORAGE_KEY = 'mbus-pinned-stops';

export function loadPinnedStops(): BusStop[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored) as BusStop[];
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

