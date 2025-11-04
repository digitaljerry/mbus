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
  time: string;
  destination?: string;
  delay?: number; // delay in seconds
  realtime?: boolean; // whether real-time data is available
}

export interface ScheduleResponse {
  stop: string;
  route: string;
  date: string;
  schedules: Schedule[];
  url: string;
  note?: string;
}

