import Foundation

/// The only network client in the Apple apps. It talks to the MBus API
/// (apps/web), never to brezavta or Marprom, so data fixes ship once on the server.
public struct MBusAPI: Sendable {
  public static let defaultBaseURL = URL(string: "https://mbus.vercel.app/api")!
  public static let shared = MBusAPI()

  public var baseURL: URL
  private let session: URLSession

  public init(baseURL: URL = MBusAPI.defaultBaseURL, session: URLSession? = nil) {
    self.baseURL = baseURL
    if let session {
      self.session = session
    } else {
      let config = URLSessionConfiguration.default
      config.timeoutIntervalForRequest = 15
      config.requestCachePolicy = .reloadIgnoringLocalCacheData
      // The watch reaches the API over cellular when the iPhone is away.
      config.allowsCellularAccess = true
      config.allowsExpensiveNetworkAccess = true
      config.allowsConstrainedNetworkAccess = true
      config.waitsForConnectivity = false
      config.httpAdditionalHeaders = ["Accept": "application/json", "User-Agent": "MBus-Apple/1.0"]
      self.session = URLSession(configuration: config)
    }
  }

  public enum APIError: Error, LocalizedError {
    case http(Int, String?)
    case invalidURL

    public var errorDescription: String? {
      switch self {
      case .http(let code, let note): note ?? "The server returned an error (\(code))."
      case .invalidURL: "Invalid request."
      }
    }
  }

  // MARK: Endpoints

  /// `/api/schedules?stop&route&to&limit&before`: departures (live or timetable) with arrival times.
  public func schedules(stop: String, route: String, to: String? = nil, limit: Int? = nil, before: Int? = nil) async throws -> ScheduleResponse {
    var q = [URLQueryItem(name: "stop", value: stop), URLQueryItem(name: "route", value: route.uppercased())]
    if let to, !to.isEmpty { q.append(.init(name: "to", value: to)) }
    if let limit { q.append(.init(name: "limit", value: String(limit))) }
    if let before { q.append(.init(name: "before", value: String(before))) }
    return try await get("schedules", query: q)
  }

  public func schedules(for leg: StopRoute, limit: Int? = nil, before: Int? = nil) async throws -> ScheduleResponse {
    try await schedules(stop: leg.stopId, route: leg.route, to: leg.toStopId, limit: limit, before: before)
  }

  /// `/api/stops`: every Marprom stop.
  public func stops() async throws -> [Stop] {
    let r: StopsResponse = try await get("stops")
    return r.stops
  }

  /// `/api/nearby?lat&lon`: stops near a position with their next departures.
  public func nearby(lat: Double, lon: Double, radius: Int? = nil) async throws -> NearbyResponse {
    var q = [URLQueryItem(name: "lat", value: String(lat)), URLQueryItem(name: "lon", value: String(lon))]
    if let radius { q.append(.init(name: "radius", value: String(radius))) }
    return try await get("nearby", query: q)
  }

  /// `/api/vehicles?routes=G6,P18`: live bus positions.
  public func vehicles(routes: [String] = []) async throws -> [Vehicle] {
    let q = routes.isEmpty ? [] : [URLQueryItem(name: "routes", value: routes.map { $0.uppercased() }.joined(separator: ","))]
    let r: VehiclesResponse = try await get("vehicles", query: q)
    return r.vehicles
  }

  /// `/api/geometry?trip=MARPROM:…`: route shape of a trip.
  public func geometry(trip: String) async throws -> RouteGeometry {
    try await get("geometry", query: [.init(name: "trip", value: trip)])
  }

  // MARK: Plumbing

  private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
    guard var comps = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else { throw APIError.invalidURL }
    if !query.isEmpty { comps.queryItems = query }
    guard let url = comps.url else { throw APIError.invalidURL }
    let (data, response) = try await session.data(from: url)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 200
    guard (200..<300).contains(status) else {
      let note = (try? JSONDecoder().decode(ErrorBody.self, from: data)).flatMap { $0.note ?? $0.error }
      throw APIError.http(status, note)
    }
    return try JSONDecoder().decode(T.self, from: data)
  }

  private struct ErrorBody: Decodable {
    var error: String?
    var note: String?
  }
}
