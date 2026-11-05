import AppIntents
import Foundation
import MBusKit
import WidgetKit

// App Intents shared by the app (Siri, Shortcuts, Spotlight) and the widget
// extension (interactive widgets, Control Center).

struct JourneyEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Journey"
  static let defaultQuery = JourneyQuery()

  var id: String
  var name: String

  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }

  init(_ j: Journey) {
    id = j.id
    name = j.name
  }
}

struct JourneyQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [JourneyEntity] {
    SharedStorage.load().journeys.filter { identifiers.contains($0.id) }.map(JourneyEntity.init)
  }

  func suggestedEntities() async throws -> [JourneyEntity] {
    SharedStorage.load().journeys.map(JourneyEntity.init)
  }

  func defaultResult() async -> JourneyEntity? {
    SharedStorage.load().selectedJourney.map(JourneyEntity.init)
  }
}

struct UsualBusEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Usual bus"
  static let defaultQuery = UsualBusQuery()

  var id: String
  var title: String
  var subtitle: String

  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)", subtitle: "\(subtitle)") }

  init(_ u: UsualBus) {
    id = u.id
    title = u.title
    subtitle = "\(u.route) \(u.time) · \(u.stopName ?? u.stopId)"
  }
}

struct UsualBusQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [UsualBusEntity] {
    SharedStorage.load().usualBuses.filter { identifiers.contains($0.id) }.map(UsualBusEntity.init)
  }

  func suggestedEntities() async throws -> [UsualBusEntity] {
    SharedStorage.load().usualBuses.map(UsualBusEntity.init)
  }
}

/// Starts a Live Activity for a usual bus: the given one, or whichever is next.
/// As a `LiveActivityIntent` it can start the activity from a control, widget or
/// Shortcuts automation without opening the app.
struct TrackUsualBusIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Track My Usual Bus"
  static let description = IntentDescription("Shows your next usual bus on the Lock Screen and in the Dynamic Island.")

  @Parameter(title: "Usual bus")
  var bus: UsualBusEntity?

  init() {}
  init(bus: UsualBusEntity?) { self.bus = bus }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    let buses = SharedStorage.load().usualBuses
    let target: UsualBus? = if let id = bus?.id {
      buses.first { $0.id == id }
    } else {
      UsualApproach.current(buses)?.0
        ?? buses.compactMap { u in u.nextOccurrences().first.map { (u, $0) } }.min { $0.1.depart < $1.1.depart }?.0
    }
    guard let target else { return .result(dialog: "You have no usual buses yet. Add one in MBus.") }
    guard let tracked = try await BusActivities.trackUsual(target) else {
      return .result(dialog: "\(target.title) doesn't run in the next few days.")
    }
    return .result(dialog: "Tracking the \(target.route) at \(LjubljanaTime.clock(tracked.state.departure)) from \(tracked.info.stopName).")
  }
}

struct StopTrackingIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Stop Tracking Bus"

  func perform() async throws -> some IntentResult {
    await BusActivities.endAll()
    return .result()
  }
}

/// "When's my next bus home?"
struct NextBusIntent: AppIntent {
  static let title: LocalizedStringResource = "Next Bus"
  static let description = IntentDescription("Tells you when the next bus leaves on one of your journeys.")

  @Parameter(title: "Journey")
  var journey: JourneyEntity?

  init() {}

  func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
    let state = SharedStorage.load()
    guard let j = state.journeys.first(where: { $0.id == journey?.id }) ?? state.selectedJourney else {
      return .result(value: "", dialog: "Set up a journey in MBus first.")
    }
    let board = await Board.load(j.stops, limit: 3, before: 0)
    guard let next = board.upcoming(at: .now).first else {
      return .result(value: "", dialog: "No more buses today on \(j.name).")
    }
    let c = Countdown(to: next.date)
    let live = next.schedule.isLive ? (delayInfo(next.schedule.delay).map { ", \($0.text)" } ?? ", live") : ""
    let text = "The \(next.route) leaves \(next.stopName ?? "your stop") \(c.label) at \(next.schedule.time)\(live)."
    return .result(value: text, dialog: "\(text)")
  }
}

/// Picks the journey a widget shows.
struct JourneyWidgetIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Journey"
  static let description = IntentDescription("Choose which journey to show.")

  @Parameter(title: "Journey")
  var journey: JourneyEntity?

  init() {}
}

enum WidgetKinds {
  static let nextUsual = "NextUsualBus"
  static let journey = "JourneyBoard"
  static let trackControl = "TrackUsualControl"
}
