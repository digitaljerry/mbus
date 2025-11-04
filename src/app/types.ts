export interface BusStop {
  id: string;
  name: string;
  stopId: string;
  route: string;
  description?: string;
}

export interface Schedule {
  time: string;
  destination?: string;
}

export interface ScheduleResponse {
  stop: string;
  route: string;
  date: string;
  schedules: Schedule[];
  url: string;
  note?: string;
}

