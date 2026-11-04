import type { BusStop } from '../types';

// Journeys shown on first run. Each journey lists the stop + line pairs you
// can board; their departures are merged into one board.
export const DEFAULT_STOPS: BusStop[] = [
  {
    id: 'home-to-city',
    name: '🏠 Home → 🏙️ City',
    stops: [{ stopId: '255', route: 'G6', toStopId: '358' }],
    description: 'Pohorska – pošta',
  },
  {
    id: 'home-to-school',
    name: '🏠 Home → 🏫 School',
    stops: [{ stopId: '255', route: 'G6', toStopId: '326' }],
    description: 'Pohorska – pošta',
  },
  {
    id: 'home-to-office',
    name: '🏠 Home → 🏢 Office',
    stops: [{ stopId: '255', route: 'G6', toStopId: '191' }],
    description: 'Pohorska – pošta',
  },
  {
    id: 'city-to-home',
    name: '🏙️ City → 🏠 Home',
    stops: [
      { stopId: '359', route: 'G6', toStopId: '256' },
      { stopId: '359', route: 'P18', toStopId: '150' },
    ],
    description: 'City – zdravstveni dom',
  },
  {
    id: 'office-to-home',
    name: '🏢 Office → 🏠 Home',
    stops: [
      { stopId: '347', route: 'G6', toStopId: '256' },
      { stopId: '347', route: 'P18', toStopId: '150' },
    ],
    description: 'UKC – Tabor',
  },
  {
    id: 'school-to-city',
    name: '🏫 School → 🏙️ City',
    stops: [
      { stopId: '326', route: 'G6', toStopId: '358' },
      { stopId: '243', route: 'P18', toStopId: '358' },
    ],
    description: 'Streliška / OŠ Ludvika Pliberška',
  },
  {
    id: 'school-to-home',
    name: '🏫 School → 🏠 Home',
    stops: [
      { stopId: '327', route: 'G6', toStopId: '256' },
      { stopId: '242', route: 'P18', toStopId: '150' },
    ],
    description: 'Streliška / OŠ Ludvika Pliberška',
  },
];

/** Split "🏠 Home → 🏙️ City" into an emoji + label for compact chips. */
export function splitJourneyName(name: string): { from: string; to?: string } {
  const [from, to] = name.split(/\s*(?:→|->)\s*/);
  return { from: from?.trim() || name, to: to?.trim() };
}
