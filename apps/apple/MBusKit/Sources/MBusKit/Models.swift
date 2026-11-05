import Foundation

// Mirrors apps/web/src/app/types.ts and lib/usual.ts. Field names match the
// JSON the MBus API returns, so these decode directly.

/// One stop + line you can board on a journey, optionally with where you get off.
public struct StopRoute: Codable, Hashable, Sendable {
  public var stopId: String
  public var route: String
  public var toStopId: String?

  public init(stopId: String, route: String, toStopId: String? = nil) {
    self.stopId = stopId
    self.route = route.uppercased()
    self.toStopId = toStopId
  }

  /// Same key the web app uses for a leg (`255:G6>326`).
  public var key: String { "\(stopId):\(route.uppercased())\(toStopId.map { ">\($0)" } ?? "")" }
}

/// A named journey ("🏠 Home → 🏫 School"); its legs' departures merge into one board.
public struct Journey: Codable, Hashable, Identifiable, Sendable {
  public var id: String
  public var name: String
  public var stops: [StopRoute]
  public var description: String?

  public init(id: String = UUID().uuidString, name: String, stops: [StopRoute], description: String? = nil) {
    self.id = id
    self.name = name
    self.stops = stops
    self.description = description
  }

  /// "🏠 Home → 🏙️ City" → ("🏠 Home", "🏙️ City").
  public var parts: (from: String, to: String?) {
    let pieces = name.components(separatedBy: "→").map { $0.trimmingCharacters(in: .whitespaces) }
    if pieces.count >= 2 { return (pieces[0], pieces[1]) }
    let ascii = name.components(separatedBy: "->").map { $0.trimmingCharacters(in: .whitespaces) }
    return ascii.count >= 2 ? (ascii[0], ascii[1]) : (name, nil)
  }
}

public struct Schedule: Codable, Hashable, Sendable {
  /// Displayed time HH:MM (real-time estimate when available).
  public var time: String
  /// Epoch ms of the departure.
  public var epoch: Double
  public var scheduledTime: String?
  public var destination: String?
  /// Delay in seconds.
  public var delay: Int?
  public var realtime: Bool?
  public var tripId: String?
  /// Fleet number of the bus, from Marprom's live data; matches `Vehicle.busCode`.
  public var busCode: String?
  public var arrivalTime: String?
  public var arrivalEpoch: Double?
  public var arrivalEstimated: Bool?
  /// Only on /api/nearby departures.
  public var route: String?
  public var routeColor: String?

  public init(time: String, epoch: Double, scheduledTime: String? = nil, destination: String? = nil, delay: Int? = nil,
              realtime: Bool? = nil, tripId: String? = nil, busCode: String? = nil, arrivalTime: String? = nil,
              arrivalEpoch: Double? = nil, arrivalEstimated: Bool? = nil, route: String? = nil, routeColor: String? = nil) {
    self.time = time
    self.epoch = epoch
    self.scheduledTime = scheduledTime
    self.destination = destination
    self.delay = delay
    self.realtime = realtime
    self.tripId = tripId
    self.busCode = busCode
    self.arrivalTime = arrivalTime
    self.arrivalEpoch = arrivalEpoch
    self.arrivalEstimated = arrivalEstimated
    self.route = route
    self.routeColor = routeColor
  }

  public var date: Date { Date(timeIntervalSince1970: epoch / 1000) }
  public var arrivalDate: Date? { arrivalEpoch.map { Date(timeIntervalSince1970: $0 / 1000) } }
  public var isLive: Bool { realtime == true }
}

public enum ScheduleSource: String, Codable, Sendable {
  /// Marprom's real-time data (the stop boards), laid over the timetable.
  case marpromLive = "marprom-live"
  case brezavta, marprom, none

  /// Unknown values (a newer server) decode as `.none` instead of failing the whole response.
  public init(from decoder: Decoder) throws {
    self = ScheduleSource(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .none
  }
}

public struct ScheduleResponse: Codable, Hashable, Sendable {
  public var stop: String
  public var stopName: String?
  public var lat: Double?
  public var lon: Double?
  public var route: String
  public var routeColor: String
  public var date: String
  public var schedules: [Schedule]
  public var url: String?
  public var source: ScheduleSource?
  public var note: String?
  public var toStop: String?
  public var toStopName: String?
  public var limit: Int?
  public var earlier: [Schedule]?
  public var fetchedAt: Double?
}

public struct Stop: Codable, Hashable, Identifiable, Sendable {
  public var id: String
  /// Number on the stop sign.
  public var code: String?
  public var name: String
  public var lat: Double
  public var lon: Double

  public init(id: String, code: String? = nil, name: String, lat: Double, lon: Double) {
    self.id = id
    self.code = code
    self.name = name
    self.lat = lat
    self.lon = lon
  }
}

public struct StopsResponse: Codable, Sendable {
  public var stops: [Stop]
}

public struct NearbyStop: Codable, Hashable, Identifiable, Sendable {
  public var stop: String
  public var stopName: String?
  public var lat: Double
  public var lon: Double
  public var distance: Double
  public var walkMinutes: Int
  public var departures: [Schedule]
  public var id: String { stop }
}

public struct NearbyResponse: Codable, Sendable {
  public var stops: [NearbyStop]
  public var fetchedAt: Double?
}

public struct Vehicle: Codable, Hashable, Identifiable, Sendable {
  public var id: String
  public var plate: String?
  public var route: String
  public var color: String
  public var lat: Double
  public var lon: Double
  public var heading: Double?
  public var headsign: String?
  public var tripId: String?
  /// Fleet number; matches `Schedule.busCode`.
  public var busCode: String?
  public var nextStop: String?
  public var timestamp: Double
}

public struct VehiclesResponse: Codable, Sendable {
  public var vehicles: [Vehicle]
  public var fetchedAt: Double?
}

/// GeoJSON LineString of a trip's route.
public struct RouteGeometry: Codable, Sendable {
  public var type: String
  /// [lon, lat] pairs.
  public var coordinates: [[Double]]
}
