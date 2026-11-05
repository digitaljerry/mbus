import Foundation
import Observation

/// Everything the user sets up. Small, so it's one JSON file shared through the
/// App Group with widgets and intents, and sent as-is to the watch.
public struct AppState: Codable, Equatable, Sendable {
  public var journeys: [Journey]
  public var usualBuses: [UsualBus]
  public var selectedJourneyId: String?
  public var settings: Settings
  /// When this state last changed (epoch s); the newer side wins when syncing with the watch.
  public var updatedAt: Double

  public struct Settings: Codable, Equatable, Sendable {
    /// Start a Live Activity automatically when a usual bus is approaching.
    public var autoLiveActivity: Bool = true
    /// Keep the screen on while a bus is under 10 minutes away.
    public var keepAwake: Bool = true
    /// Schedule usual-bus reminders on the watch itself (works without the iPhone).
    public var watchReminders: Bool = true

    public init() {}

    // Missing keys fall back to defaults, so adding a setting never resets saved state.
    public init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      autoLiveActivity = try c.decodeIfPresent(Bool.self, forKey: .autoLiveActivity) ?? true
      keepAwake = try c.decodeIfPresent(Bool.self, forKey: .keepAwake) ?? true
      watchReminders = try c.decodeIfPresent(Bool.self, forKey: .watchReminders) ?? true
    }
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    journeys = try c.decodeIfPresent([Journey].self, forKey: .journeys) ?? Defaults.journeys
    usualBuses = try c.decodeIfPresent([UsualBus].self, forKey: .usualBuses) ?? []
    selectedJourneyId = try c.decodeIfPresent(String.self, forKey: .selectedJourneyId)
    settings = try c.decodeIfPresent(Settings.self, forKey: .settings) ?? .init()
    updatedAt = try c.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
  }

  public init(journeys: [Journey] = Defaults.journeys, usualBuses: [UsualBus] = [], selectedJourneyId: String? = nil,
              settings: Settings = .init(), updatedAt: Double = 0) {
    self.journeys = journeys
    self.usualBuses = usualBuses
    self.selectedJourneyId = selectedJourneyId
    self.settings = settings
    self.updatedAt = updatedAt
  }

  public var selectedJourney: Journey? {
    journeys.first { $0.id == selectedJourneyId } ?? journeys.first
  }
}

/// Reads and writes `state.json` in the App Group container.
public enum SharedStorage {
  public static let appGroup = "group.dev.zorec.mbus"

  public static var directory: URL {
    if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) { return url }
    // No App Group (e.g. unsigned builds or `swift test`): fall back to the app's own container.
    let url = URL.applicationSupportDirectory.appending(path: "MBus", directoryHint: .isDirectory)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  public static var stateURL: URL { directory.appending(path: "state.json") }

  public static func load() -> AppState {
    guard let data = try? Data(contentsOf: stateURL), let state = try? JSONDecoder().decode(AppState.self, from: data) else {
      return AppState()
    }
    return state
  }

  public static func save(_ state: AppState) {
    guard let data = try? JSONEncoder().encode(state) else { return }
    try? data.write(to: stateURL, options: .atomic)
  }

  /// Cached stop list (refreshed weekly from /api/stops).
  public static var stopsURL: URL { directory.appending(path: "stops.json") }
}

/// Observable wrapper the apps bind their UI to.
@MainActor
@Observable
public final class AppStore {
  public private(set) var state: AppState
  /// Called after every change (reschedule reminders, reload widgets, sync to watch).
  @ObservationIgnored public var onChange: ((AppState) -> Void)?

  public init(state: AppState = SharedStorage.load()) {
    self.state = state
  }

  public var journeys: [Journey] { state.journeys }
  public var usualBuses: [UsualBus] { state.usualBuses }
  public var settings: AppState.Settings { state.settings }
  public var selectedJourney: Journey? { state.selectedJourney }

  public func update(_ change: (inout AppState) -> Void) {
    var next = state
    change(&next)
    guard next != state else { return }
    next.updatedAt = Date.now.timeIntervalSince1970
    state = next
    SharedStorage.save(next)
    onChange?(next)
  }

  /// Takes state from the other device (watch ↔ phone) when it is newer.
  public func merge(remote: AppState) {
    guard remote.updatedAt > state.updatedAt else { return }
    state = remote
    SharedStorage.save(remote)
    onChange?(remote)
  }

  public func reloadFromDisk() {
    let disk = SharedStorage.load()
    if disk != state { state = disk }
  }

  // MARK: Conveniences

  public func select(_ journey: Journey) { update { $0.selectedJourneyId = journey.id } }

  public func upsert(_ journey: Journey) {
    update { s in
      if let i = s.journeys.firstIndex(where: { $0.id == journey.id }) { s.journeys[i] = journey } else { s.journeys.append(journey) }
    }
  }

  public func deleteJourney(_ id: String) { update { $0.journeys.removeAll { $0.id == id } } }

  public func upsert(_ usual: UsualBus) {
    update { s in
      if let i = s.usualBuses.firstIndex(where: { $0.id == usual.id }) { s.usualBuses[i] = usual } else { s.usualBuses.append(usual) }
    }
  }

  public func deleteUsual(_ id: String) { update { $0.usualBuses.removeAll { $0.id == id } } }

  public func usual(for d: BoardDeparture) -> UsualBus? {
    state.usualBuses.first { $0.matches(stopId: d.leg.stopId, route: d.route, time: d.schedule.scheduledTime ?? d.schedule.time) }
  }
}
