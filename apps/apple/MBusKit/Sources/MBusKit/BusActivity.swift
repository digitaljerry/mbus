import Foundation
#if canImport(ActivityKit) && os(iOS)
import ActivityKit
#endif

/// Static data for a tracked bus (Live Activity / Dynamic Island).
public struct BusActivityInfo: Codable, Hashable, Sendable {
  public var route: String
  public var routeColor: String
  public var stopId: String
  public var stopName: String
  public var destination: String?
  public var toStopId: String?
  public var toStopName: String?
  /// Timetabled time HH:MM, used to find the same trip again when refreshing.
  public var scheduledTime: String
  public var tripId: String?
  /// Set when this is a usual bus.
  public var usualId: String?
  public var walkMinutes: Int?

  public init(route: String, routeColor: String, stopId: String, stopName: String, destination: String? = nil, toStopId: String? = nil,
              toStopName: String? = nil, scheduledTime: String, tripId: String? = nil, usualId: String? = nil, walkMinutes: Int? = nil) {
    self.route = route
    self.routeColor = routeColor
    self.stopId = stopId
    self.stopName = stopName
    self.destination = destination
    self.toStopId = toStopId
    self.toStopName = toStopName
    self.scheduledTime = scheduledTime
    self.tripId = tripId
    self.usualId = usualId
    self.walkMinutes = walkMinutes
  }

  public init(_ d: BoardDeparture, usual: UsualBus? = nil) {
    self.init(route: d.route, routeColor: d.routeColor, stopId: d.leg.stopId, stopName: d.stopName ?? "Stop \(d.leg.stopId)",
              destination: d.schedule.destination, toStopId: d.leg.toStopId, toStopName: d.toStopName,
              scheduledTime: d.schedule.scheduledTime ?? d.schedule.time, tripId: d.schedule.tripId, usualId: usual?.id, walkMinutes: usual?.walkMinutes)
  }

  public var leg: StopRoute { StopRoute(stopId: stopId, route: route, toStopId: toStopId) }
}

/// Changing data for a tracked bus. Field names are the APNs `content-state` contract for M5.
public struct BusActivityState: Codable, Hashable, Sendable {
  public var departure: Date
  public var arrival: Date?
  public var delaySeconds: Int?
  public var realtime: Bool
  public var updatedAt: Date

  public init(departure: Date, arrival: Date? = nil, delaySeconds: Int? = nil, realtime: Bool = false, updatedAt: Date = .now) {
    self.departure = departure
    self.arrival = arrival
    self.delaySeconds = delaySeconds
    self.realtime = realtime
    self.updatedAt = updatedAt
  }

  public init(_ s: Schedule) {
    self.init(departure: s.date, arrival: s.arrivalDate, delaySeconds: s.delay, realtime: s.isLive)
  }

  /// When to leave for the stop, if the walk time is known.
  public func leaveBy(walkMinutes: Int?) -> Date? {
    walkMinutes.map { departure.addingTimeInterval(-TimeInterval($0 * 60)) }
  }
}

#if canImport(ActivityKit) && os(iOS)
public struct BusActivityAttributes: ActivityAttributes {
  public typealias ContentState = BusActivityState
  public var info: BusActivityInfo

  public init(info: BusActivityInfo) { self.info = info }
}
#endif

extension BusActivityInfo {
  /// Finds this bus on a fresh schedule response.
  public func find(in r: ScheduleResponse) -> Schedule? {
    let all = (r.earlier ?? []) + r.schedules
    if let tripId, let s = all.first(where: { $0.tripId == tripId }) { return s }
    return all.first { ($0.scheduledTime ?? $0.time) == scheduledTime && (destination == nil || $0.destination == destination) }
  }
}
