import Foundation

/// Mirrors apps/web/src/app/lib/time.ts: everything is pinned to Maribor's
/// time zone, so the phone agrees with the server on "today" wherever it is.
public enum LjubljanaTime {
  public static let timeZone = TimeZone(identifier: "Europe/Ljubljana")!

  public static let calendar: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = timeZone
    c.locale = Locale(identifier: "en_GB")
    return c
  }()

  /// YYYY-MM-DD in Ljubljana.
  public static func dateString(_ date: Date = .now) -> String {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
  }

  public static func addDays(_ dateString: String, _ days: Int) -> String {
    guard let d = midnight(dateString), let next = calendar.date(byAdding: .day, value: days, to: d) else { return dateString }
    return self.dateString(next)
  }

  /// Local midnight in Ljubljana for a YYYY-MM-DD date.
  public static func midnight(_ dateString: String) -> Date? {
    let parts = dateString.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  /// Wall-clock "HH:MM" on a service date, correct on DST days. Times past 24:00
  /// (after-midnight trips) roll over to the next day.
  public static func serviceTime(_ dateString: String, hhmm: String) -> Date? {
    let p = hhmm.split(separator: ":").compactMap { Int($0) }
    guard p.count >= 2 else { return nil }
    let date = p[0] >= 24 ? addDays(dateString, p[0] / 24) : dateString
    let d = date.split(separator: "-").compactMap { Int($0) }
    guard d.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: d[0], month: d[1], day: d[2], hour: p[0] % 24, minute: p[1]))
  }

  public static func seconds(_ hhmm: String) -> Int? {
    let p = hhmm.split(separator: ":").compactMap { Int($0) }
    guard p.count >= 2 else { return nil }
    return p[0] * 3600 + p[1] * 60
  }

  /// ISO weekday (1 = Mon … 7 = Sun) in Ljubljana.
  public static func isoWeekday(_ date: Date) -> Int {
    let w = calendar.component(.weekday, from: date) // 1 = Sun
    return w == 1 ? 7 : w - 1
  }

  public static func isoWeekday(_ dateString: String) -> Int {
    midnight(dateString).map(isoWeekday) ?? 1
  }

  /// HH:MM in Ljubljana.
  public static func clock(_ date: Date) -> String {
    let c = calendar.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", c.hour!, c.minute!)
  }
}

/// School holidays: Marprom runs a holiday timetable on weekdays it doesn't
/// publish online. Mirrors apps/web/src/app/lib/holidays.ts.
public enum SchoolHolidays {
  public static let periods: [(from: String, to: String)] = [
    ("2026-12-28", "2026-12-31"),
    ("2027-04-28", "2027-04-30"),
    ("2027-06-26", "2027-08-31"),
  ]

  public static func isHolidayWeekday(_ date: Date) -> Bool {
    let d = LjubljanaTime.dateString(date)
    guard LjubljanaTime.isoWeekday(d) <= 5 else { return false }
    return periods.contains { d >= $0.from && d <= $0.to }
  }

  public static func mayBeOff(_ s: Schedule) -> Bool { !s.isLive && isHolidayWeekday(s.date) }

  public static let notice =
    "School holidays: buses run on a holiday timetable that Marprom doesn't publish online, so these times may be off. Check the sign at the stop."
}
