export interface StopRoute {
  stopId: string;
  route: string;
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
}

export type ScheduleSource = 'brezavta' | 'marprom' | 'none';

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
  fetchedAt: number;
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
  nextStop?: string;
  timestamp: number;
}
