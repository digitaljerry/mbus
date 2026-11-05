export interface StopRoute {
  stopId: string;
  route: string;
  /** Optional stop where you get off, for arrival times. */
  toStopId?: string;
}

export interface BusStop {
  id: string;
  name: string;
  stops: StopRoute[];
  description?: string;
}

export interface Schedule {
  /** Displayed departure time, HH:MM (real-time estimate when available). */
  time: string;
  /** Epoch ms of the departure, used for countdowns. */
  epoch: number;
  /** Timetabled time, HH:MM. */
  scheduledTime?: string;
  destination?: string;
  delay?: number; // delay in seconds
  realtime?: boolean; // whether real-time data is available
  tripId?: string;
  /** Fleet number of the bus, when Marprom's live data has assigned one. */
  busCode?: string;
  /** Arrival at the journey's destination stop, when one is set. */
  arrivalTime?: string;
  arrivalEpoch?: number;
  /** True when the arrival is derived from typical travel time, not the trip itself. */
  arrivalEstimated?: boolean;
}

/**
 * Where the departures come from: `marprom-live` is Marprom's real-time API
 * (laid over the timetable), `brezavta` the GTFS-based API, `marprom` the
 * printed timetable only.
 */
export type ScheduleSource = 'marprom-live' | 'brezavta' | 'marprom' | 'none';

export interface ScheduleResponse {
  stop: string;
  stopName?: string;
  lat?: number;
  lon?: number;
  route: string;
  routeColor: string;
  date: string;
  schedules: Schedule[];
  url: string;
  source: ScheduleSource;
  note?: string;
  toStop?: string;
  toStopName?: string;
  /** How many departures were asked for; fewer back means that's all (today + tomorrow). */
  limit?: number;
  /** Departures already due (oldest first), when asked for with `before`. */
  earlier?: Schedule[];
  fetchedAt: number;
}

/** The bus serving a departure, from a map keyed by trip ID and `bus:<code>`. */
export function vehicleFor(byKey: Map<string, Vehicle>, s: { tripId?: string; busCode?: string }): Vehicle | undefined {
  return (s.busCode ? byKey.get(`bus:${s.busCode}`) : undefined) ?? (s.tripId ? byKey.get(s.tripId) : undefined);
}

export interface Vehicle {
  id: string;
  plate?: string;
  route: string;
  color: string;
  lat: number;
  lon: number;
  heading?: number;
  headsign?: string;
  tripId?: string;
  /** Fleet number; matches `Schedule.busCode`. */
  busCode?: string;
  nextStop?: string;
  timestamp: number;
}
