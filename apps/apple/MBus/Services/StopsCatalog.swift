import CoreLocation
import Foundation
import MBusKit
import Observation

/// All Marprom stops, cached on disk and refreshed weekly from /api/stops.
@MainActor
@Observable
final class StopsCatalog {
  private(set) var stops: [Stop] = []
  private(set) var byId: [String: Stop] = [:]
  private(set) var failed = false
  @ObservationIgnored private var loadingTask: Task<Void, Never>?

  func loadIfNeeded() async {
    if stops.isEmpty, let data = try? Data(contentsOf: SharedStorage.stopsURL), let cached = try? JSONDecoder().decode([Stop].self, from: data) {
      set(cached)
    }
    let age = (try? SharedStorage.stopsURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate).map { Date.now.timeIntervalSince($0) }
    guard stops.isEmpty || (age ?? .infinity) > 7 * 86_400 else { return }
    if let loadingTask { return await loadingTask.value }
    let task = Task {
      do {
        let fresh = try await MBusAPI.shared.stops()
        self.set(fresh)
        self.failed = false
        if let data = try? JSONEncoder().encode(fresh) { try? data.write(to: SharedStorage.stopsURL, options: .atomic) }
      } catch {
        self.failed = self.stops.isEmpty
      }
    }
    loadingTask = task
    await task.value
    loadingTask = nil
  }

  private func set(_ list: [Stop]) {
    stops = list.sorted { ($0.name, Int($0.code ?? "") ?? 0) < ($1.name, Int($1.code ?? "") ?? 0) }
    byId = Dictionary(list.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
  }

  func name(_ id: String?) -> String? { id.flatMap { byId[$0]?.name } }

  /// Matches name (accent-insensitive), sign number or stop ID.
  func search(_ query: String) -> [Stop] {
    let q = query.trimmingCharacters(in: .whitespaces)
    guard !q.isEmpty else { return stops }
    return stops.filter {
      $0.name.range(of: q, options: [.caseInsensitive, .diacriticInsensitive]) != nil || $0.code == q || $0.id == q
    }
  }

  func nearest(to location: CLLocation, limit: Int = 5) -> [Stop] {
    stops.sorted {
      location.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lon)) < location.distance(from: CLLocation(latitude: $1.lat, longitude: $1.lon))
    }.prefix(limit).map { $0 }
  }
}

/// One-shot "where am I" using the async CoreLocation API.
@MainActor
@Observable
final class LocationProvider {
  private(set) var location: CLLocation?
  private(set) var denied = false
  private(set) var locating = false

  func locate() async {
    locating = true
    defer { locating = false }
    let session = CLServiceSession(authorization: .whenInUse)
    defer { session.invalidate() }
    do {
      for try await update in CLLocationUpdate.liveUpdates() {
        if update.authorizationDenied || update.authorizationDeniedGlobally {
          denied = true
          return
        }
        if let loc = update.location, loc.horizontalAccuracy < 200 || update.stationary {
          location = loc
          denied = false
          return
        }
        if let loc = update.location { location = loc }
      }
    } catch {}
  }
}
