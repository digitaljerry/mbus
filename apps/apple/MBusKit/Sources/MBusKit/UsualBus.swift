import Foundation

/// A bus you take regularly. Same model as apps/web/src/app/lib/usual.ts.
public struct UsualBus: Codable, Hashable, Identifiable, Sendable {
  public var id: String
  public var label: String?
  public var stopId: String
  public var stopName: String?
  public var route: String
  public var routeColor: String?
  /// Headsign, to tell directions apart.
  public var destination: String?
  /// Timetabled departure, HH:MM.
  public var time: String
  /// ISO weekdays: 1 = Monday … 7 = Sunday.
  public var days: [Int]
  public var walkMinutes: Int
  public var toStopId: String?
  public var toStopName: String?
  public var remind: Bool
  /// Minutes before the leave-by time to notify.
  public var remindBefore: Int
  public var createdAt: Double

  public init(id: String = UUID().uuidString, label: String? = nil, stopId: String, stopName: String? = nil, route: String,
              routeColor: String? = nil, destination: String? = nil, time: String, days: [Int] = [1, 2, 3, 4, 5],
              walkMinutes: Int = 5, toStopId: String? = nil, toStopName: String? = nil, remind: Bool = true,
              remindBefore: Int = 2, createdAt: Double = Date.now.timeIntervalSince1970 * 1000) {
    self.id = id
    self.label = label
    self.stopId = stopId
    self.stopName = stopName
    self.route = route.uppercased()
    self.routeColor = routeColor
    self.destination = destination
    self.time = time
    self.days = days
    self.walkMinutes = walkMinutes
    self.toStopId = toStopId
    self.toStopName = toStopName
    self.remind = remind
    self.remindBefore = remindBefore
    self.createdAt = createdAt
  }

  public var leg: StopRoute { StopRoute(stopId: stopId, route: route, toStopId: toStopId) }
  public var title: String { label?.isEmpty == false ? label! : "\(route) at \(time)" }

  public static let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  public var daysDescription: String {
    let set = Array(Set(days)).sorted()
    switch set {
    case [1, 2, 3, 4, 5, 6, 7]: return "Every day"
    case [1, 2, 3, 4, 5]: return "Weekdays"
    case [6, 7]: return "Weekends"
    default: return set.map { Self.dayNames[$0 - 1] }.joined(separator: ", ")
    }
  }

  /// Same stop, line and timetabled time → the same usual bus.
  public func matches(stopId: String, route: String, time: String?) -> Bool {
    self.stopId == stopId && self.route.caseInsensitiveCompare(route) == .orderedSame && self.time == time
  }

  /// The departure on a board that is this usual bus (by timetabled time, then direction).
  public func match(in schedules: [Schedule], on date: String) -> Schedule? {
    schedules.first { s in
      (s.scheduledTime ?? s.time) == time
        && LjubljanaTime.dateString(s.date.addingTimeInterval(-TimeInterval(s.delay ?? 0))) == date
        && (destination == nil || s.destination == nil || s.destination == destination)
    }
  }
}

/// One day's instance of a usual bus.
public struct Occurrence: Hashable, Sendable {
  public var usualId: String
  /// Service date, YYYY-MM-DD (Ljubljana).
  public var date: String
  /// Timetabled (or live, when adjusted) departure.
  public var depart: Date
  /// depart − walk.
  public var leave: Date
  /// When the reminder fires.
  public var notify: Date
  public var key: String { "\(usualId)@\(date)" }
}

extension UsualBus {
  public func occurrence(on date: String, liveDeparture: Date? = nil) -> Occurrence? {
    guard let timetable = LjubljanaTime.serviceTime(date, hhmm: time) else { return nil }
    let depart = liveDeparture ?? timetable
    let leave = depart.addingTimeInterval(-TimeInterval(walkMinutes * 60))
    return Occurrence(usualId: id, date: date, depart: depart, leave: leave, notify: leave.addingTimeInterval(-TimeInterval(remindBefore * 60)))
  }

  /// Upcoming occurrences departing after `from`, within ~9 days.
  public func nextOccurrences(from: Date = .now, count: Int = 1) -> [Occurrence] {
    guard !days.isEmpty else { return [] }
    var out: [Occurrence] = []
    let today = LjubljanaTime.dateString(from)
    for i in 0..<9 where out.count < count {
      let date = LjubljanaTime.addDays(today, i)
      guard days.contains(LjubljanaTime.isoWeekday(date)), let occ = occurrence(on: date), occ.depart > from else { continue }
      out.append(occ)
    }
    return out
  }
}

/// "Approaching" = a usual bus whose reminder time has come and which hasn't left yet.
public enum UsualApproach {
  /// How long before the notify time the app starts watching (fetching live data).
  public static let watchLead: TimeInterval = 15 * 60
  /// Keep an approaching bus around briefly after departure, so "Now" shows.
  public static let grace: TimeInterval = 60

  public enum Phase: Sendable, Equatable {
    /// Before the watch window.
    case later
    /// Inside the watch window, before the reminder time.
    case soon
    /// Time to get ready / leave: show a Live Activity and notify.
    case approaching
    case departed
  }

  public static func phase(of occ: Occurrence, now: Date = .now) -> Phase {
    if now > occ.depart.addingTimeInterval(grace) { return .departed }
    if now >= occ.notify { return .approaching }
    if now >= occ.notify.addingTimeInterval(-watchLead) { return .soon }
    return .later
  }

  /// How far past its timetabled time a bus may still be on its way (late buses).
  public static let lateLookback: TimeInterval = 30 * 60

  /// Occurrences that may still be relevant: timetabled up to `lateLookback` ago, then upcoming.
  public static func candidates(_ u: UsualBus, now: Date = .now) -> [Occurrence] {
    u.nextOccurrences(from: now.addingTimeInterval(-lateLookback), count: 2)
  }

  /// The nearest occurrence across usual buses that is soon or approaching.
  /// `live` maps occurrence keys to live departure times, so a late bus stays
  /// "approaching" until it has actually left. Without live data, a bus counts
  /// as gone shortly after its timetabled time.
  public static func current(_ buses: [UsualBus], now: Date = .now, live: [String: Date] = [:]) -> (UsualBus, Occurrence, Phase)? {
    buses
      .compactMap { u -> (UsualBus, Occurrence, Phase)? in
        for base in candidates(u, now: now) {
          let occ = live[base.key].flatMap { u.occurrence(on: base.date, liveDeparture: $0) } ?? base
          let p = phase(of: occ, now: now)
          if p == .departed { continue }
          return p == .soon || p == .approaching ? (u, occ, p) : nil
        }
        return nil
      }
      .min { $0.1.depart < $1.1.depart }
  }

  /// Occurrences whose timetabled time passed within `lateLookback`, for which live
  /// data could show the bus is still coming.
  public static func possiblyLate(_ buses: [UsualBus], now: Date = .now) -> [(UsualBus, Occurrence)] {
    buses.flatMap { u in
      candidates(u, now: now).filter { $0.depart <= now.addingTimeInterval(grace) }.map { (u, $0) }
    }
  }
}
