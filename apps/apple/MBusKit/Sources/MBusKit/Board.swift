import Foundation

/// One row on a journey board: a departure plus the leg it belongs to.
public struct BoardDeparture: Hashable, Identifiable, Sendable {
  public var leg: StopRoute
  public var route: String
  public var routeColor: String
  public var stopName: String?
  public var toStopName: String?
  public var schedule: Schedule
  public var source: ScheduleSource?

  public var id: String { "\(leg.key)#\(schedule.tripId ?? schedule.scheduledTime ?? schedule.time)#\(Int(schedule.epoch))" }
  public var date: Date { schedule.date }
}

/// Departures for every leg of a journey, merged and sorted, like the web board.
public struct Board: Sendable {
  public var upcoming: [BoardDeparture]
  public var earlier: [BoardDeparture]
  public var responses: [String: ScheduleResponse]
  public var failedLegs: Set<String>
  public var fetchedAt: Date

  public init(upcoming: [BoardDeparture] = [], earlier: [BoardDeparture] = [], responses: [String: ScheduleResponse] = [:],
              failedLegs: Set<String> = [], fetchedAt: Date = .distantPast) {
    self.upcoming = upcoming
    self.earlier = earlier
    self.responses = responses
    self.failedLegs = failedLegs
    self.fetchedAt = fetchedAt
  }

  public var isEmpty: Bool { upcoming.isEmpty && earlier.isEmpty }
  public var anyLive: Bool { upcoming.contains { $0.schedule.isLive } }
  public var notes: [String] { Array(Set(responses.values.compactMap(\.note))).sorted() }

  /// Upcoming at `now` (a departure counts until 30 s after it leaves).
  public func upcoming(at now: Date) -> [BoardDeparture] {
    upcoming.filter { $0.date.timeIntervalSince(now) > -30 }
  }

  public static func merge(_ responses: [StopRoute: ScheduleResponse], failed: Set<String> = []) -> Board {
    var up: [BoardDeparture] = []
    var early: [BoardDeparture] = []
    for (leg, r) in responses {
      func row(_ s: Schedule) -> BoardDeparture {
        BoardDeparture(leg: leg, route: r.route, routeColor: r.routeColor, stopName: r.stopName, toStopName: r.toStopName, schedule: s, source: r.source)
      }
      up += r.schedules.map(row)
      early += (r.earlier ?? []).map(row)
    }
    up.sort { $0.schedule.epoch < $1.schedule.epoch }
    early.sort { $0.schedule.epoch < $1.schedule.epoch }
    var byKey: [String: ScheduleResponse] = [:]
    for (leg, r) in responses { byKey[leg.key] = r }
    return Board(upcoming: up, earlier: early, responses: byKey, failedLegs: failed, fetchedAt: .now)
  }

  /// Fetches every leg in parallel. Legs that fail are reported, not fatal.
  public static func load(_ legs: [StopRoute], api: MBusAPI = .shared, limit: Int? = nil, before: Int = 3) async -> Board {
    let unique = Array(Set(legs))
    var results: [StopRoute: ScheduleResponse] = [:]
    var failed: Set<String> = []
    await withTaskGroup(of: (StopRoute, ScheduleResponse?).self) { group in
      for leg in unique {
        group.addTask { (leg, try? await api.schedules(for: leg, limit: limit, before: before)) }
      }
      for await (leg, r) in group {
        if let r { results[leg] = r } else { failed.insert(leg.key) }
      }
    }
    return merge(results, failed: failed)
  }
}
