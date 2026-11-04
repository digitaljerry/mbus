import { zonedDateString } from './time';
import { isoWeekday } from './usual';

// School holidays (šolske počitnice, "ŠP"). On weekdays in these periods
// Marprom runs a separate timetable that its website doesn't serve (it still
// returns the normal weekday times), so timetable-only times may be wrong.
// Dates from the timetable signs at the stops ("velja od 01.09.2026").
export const SCHOOL_HOLIDAYS: Array<{ from: string; to: string }> = [
  { from: '2026-12-28', to: '2026-12-31' },
  { from: '2027-04-28', to: '2027-04-30' },
  { from: '2027-06-26', to: '2027-08-31' },
];

/** True on a Mon–Fri inside a school-holiday period (Ljubljana date). */
export function isSchoolHolidayWeekday(epoch: number): boolean {
  const date = zonedDateString(new Date(epoch));
  if (isoWeekday(date) > 5) return false;
  return SCHOOL_HOLIDAYS.some(h => date >= h.from && date <= h.to);
}

/** A timetable time (no live data) on a school-holiday weekday may not match the sign. */
export function mayUseHolidayTimetable(s: { epoch: number; realtime?: boolean }): boolean {
  return !s.realtime && isSchoolHolidayWeekday(s.epoch);
}

export const HOLIDAY_NOTICE =
  "School holidays: buses run on a holiday timetable that Marprom doesn't publish online, so these times may be off. Check the sign at the stop.";
