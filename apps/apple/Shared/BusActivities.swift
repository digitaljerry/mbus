import ActivityKit
import Foundation
import MBusKit

/// Starts, refreshes and ends bus Live Activities. Compiled into the app and the
/// widget extension; `LiveActivityIntent`s run it in the app's process.
nonisolated enum BusActivities {
  /// What was started, without handing the non-Sendable `Activity` across actors.
  struct Tracked: Sendable {
    var info: BusActivityInfo
    var state: BusActivityState
  }

  typealias BusActivity = Activity<BusActivityAttributes>

  static var all: [BusActivity] { BusActivity.activities }
  static var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

  static func activity(for info: BusActivityInfo) -> BusActivity? {
    all.first {
      let a = $0.attributes.info
      return a.stopId == info.stopId && a.route == info.route && a.scheduledTime == info.scheduledTime
        && a.destination == info.destination && $0.activityState == .active
    }
  }

  static func isTracking(_ d: BoardDeparture) -> Bool { activity(for: BusActivityInfo(d)) != nil }

  /// Starts tracking a bus (or updates the activity already tracking it). Other
  /// activities end, so the Dynamic Island shows one bus.
  @discardableResult
  static func start(_ info: BusActivityInfo, state: BusActivityState) async throws -> Tracked {
    let content = ActivityContent(state: state, staleDate: state.departure.addingTimeInterval(5 * 60), relevanceScore: 100)
    if let existing = activity(for: info) {
      await existing.update(content)
      return Tracked(info: info, state: state)
    }
    for other in all { await other.end(nil, dismissalPolicy: .immediate) }
    // pushType: .token once APNs is set up (M5): the server then drives updates.
    _ = try BusActivity.request(attributes: BusActivityAttributes(info: info), content: content, pushType: nil)
    return Tracked(info: info, state: state)
  }

  static func start(_ d: BoardDeparture, usual: UsualBus? = nil) async throws {
    try await start(BusActivityInfo(d, usual: usual), state: BusActivityState(d.schedule))
  }

  static func end(_ info: BusActivityInfo) async {
    await activity(for: info)?.end(nil, dismissalPolicy: .immediate)
  }

  static func endAll() async {
    for a in all { await a.end(nil, dismissalPolicy: .immediate) }
  }

  /// Re-fetches every tracked bus and updates its activity; ends ones that left.
  static func refreshAll(api: MBusAPI = .shared) async {
    // Stale ones too: past their stale date they still need ending.
    for activity in all where activity.activityState == .active || activity.activityState == .stale {
      let info = activity.attributes.info
      let current = activity.content.state
      if Date.now > current.departure.addingTimeInterval(2 * 60) {
        let final = ActivityContent(state: current, staleDate: nil)
        await activity.end(final, dismissalPolicy: .after(.now.addingTimeInterval(60)))
        continue
      }
      guard let r = try? await api.schedules(for: info.leg, limit: 6, before: 3), let s = info.find(in: r) else { continue }
      let next = BusActivityState(s)
      guard next.departure != current.departure || next.realtime != current.realtime || next.arrival != current.arrival else { continue }
      // Alert (on the lock screen and watch) when the bus is ≥ 1 min later or earlier than shown.
      let moved = abs(next.departure.timeIntervalSince(current.departure)) >= 60
      let alert = moved
        ? AlertConfiguration(title: "\(info.route) now \(LjubljanaTime.clock(next.departure))",
                             body: "\(delayInfo(next.delaySeconds)?.text ?? "Time changed") at \(info.stopName)", sound: .default)
        : nil
      await activity.update(ActivityContent(state: next, staleDate: next.departure.addingTimeInterval(5 * 60), relevanceScore: 100), alertConfiguration: alert)
    }
  }

  /// Finds the live departure for a usual bus's next occurrence and starts tracking it.
  @discardableResult
  static func trackUsual(_ u: UsualBus, api: MBusAPI = .shared) async throws -> Tracked? {
    let r = try? await api.schedules(for: u.leg, limit: 8, before: 3)
    let all = r.map { ($0.earlier ?? []) + $0.schedules } ?? []
    // The first occurrence that hasn't left yet, judged by its live time (a late bus
    // counts until it actually leaves), else by the timetable.
    var picked: (Occurrence, Schedule?)?
    for base in UsualApproach.candidates(u) {
      let s = u.match(in: all, on: base.date)
      if (s?.date ?? base.depart).addingTimeInterval(UsualApproach.grace) > .now {
        picked = (base, s)
        break
      }
    }
    guard let (occ, s) = picked else { return nil }
    let info = BusActivityInfo(route: u.route, routeColor: RouteColors.hex(for: u.route, other: r?.routeColor ?? u.routeColor), stopId: u.stopId,
                               stopName: r?.stopName ?? u.stopName ?? "Stop \(u.stopId)", destination: s?.destination ?? u.destination,
                               toStopId: u.toStopId, toStopName: r?.toStopName ?? u.toStopName, scheduledTime: u.time, tripId: s?.tripId,
                               usualId: u.id, walkMinutes: u.walkMinutes)
    let state = s.map(BusActivityState.init) ?? BusActivityState(departure: occ.depart)
    return try await start(info, state: state)
  }
}
