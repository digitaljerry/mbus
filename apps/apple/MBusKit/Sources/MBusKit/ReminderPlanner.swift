import Foundation

/// A reminder to schedule as a local notification. Pure data, so the iPhone and
/// the watch plan the same reminders with the same identifiers.
public struct PlannedReminder: Hashable, Sendable {
  public var id: String
  public var usualId: String
  public var fireDate: Date
  public var departure: Date
  public var title: String
  public var body: String
  public var isLive: Bool
}

public enum ReminderPlanner {
  /// iOS allows 64 pending notifications; keep room for other kinds.
  public static let maxPending = 48
  public static let horizonDays = 7
  public static let categoryId = "USUAL_BUS"
  public static let trackActionId = "TRACK"

  /// Reminders for the next week. `live` maps occurrence keys to live departures
  /// (from a fresh board), so a delayed bus moves its reminder.
  /// `delivered` holds reminder IDs already shown, which are never planned again.
  public static func plan(_ buses: [UsualBus], now: Date = .now, live: [String: Schedule] = [:], delivered: Set<String> = []) -> [PlannedReminder] {
    var out: [PlannedReminder] = []
    for u in buses where u.remind && !u.days.isEmpty {
      for base in u.nextOccurrences(from: now, count: horizonDays + 1) {
        let liveSchedule = live[base.key]
        guard let occ = u.occurrence(on: base.date, liveDeparture: liveSchedule?.date) else { continue }
        // Only future reminders: a reminder whose time has passed was already shown
        // (or the bus was set up too late for one); the in-app banner covers that case.
        guard occ.notify > now, !delivered.contains("usual:\(occ.key)") else { continue }
        out.append(reminder(u, occ, fire: occ.notify, live: liveSchedule))
      }
    }
    return Array(out.sorted { $0.fireDate < $1.fireDate }.prefix(maxPending))
  }

  static func reminder(_ u: UsualBus, _ occ: Occurrence, fire: Date, live: Schedule?) -> PlannedReminder {
    let stop = u.stopName ?? "your stop"
    let departs = LjubljanaTime.clock(occ.depart)
    var body = "Leave by \(LjubljanaTime.clock(occ.leave)) to catch the \(departs) from \(stop)"
    if u.walkMinutes > 0 { body += " (\(u.walkMinutes) min walk)" }
    if let d = delayInfo(live?.delay), live?.isLive == true { body += " · \(d.text)" }
    body += "."
    let title = u.label?.isEmpty == false ? "\(u.route) · \(u.label!)" : "\(u.route) to \(u.destination ?? u.toStopName ?? "town") is coming"
    return PlannedReminder(id: "usual:\(occ.key)", usualId: u.id, fireDate: fire, departure: occ.depart, title: title, body: body,
                           isLive: live?.isLive == true)
  }
}
