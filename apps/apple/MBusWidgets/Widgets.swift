import AppIntents
import MBusKit
import MBusUI
import SwiftUI
import WidgetKit

@main
struct MBusWidgetsBundle: WidgetBundle {
  var body: some Widget {
    NextUsualWidget()
    JourneyWidget()
    BusLiveActivity()
    TrackUsualControl()
  }
}

// MARK: Next usual bus (small, lock screen)

struct UsualEntry: TimelineEntry {
  var date: Date
  var usual: UsualBus?
  var departure: Date?
  var live: Schedule?
  var relevance: TimelineEntryRelevance?

  var leaveBy: Date? { departure.map { $0.addingTimeInterval(-TimeInterval((usual?.walkMinutes ?? 0) * 60)) } }
}

struct UsualProvider: TimelineProvider {
  func placeholder(in context: Context) -> UsualEntry {
    UsualEntry(date: .now, usual: UsualBus(stopId: "255", stopName: "Pohorska", route: "G6", time: "07:31"), departure: .now.addingTimeInterval(540))
  }

  func getSnapshot(in context: Context, completion: @escaping @Sendable (UsualEntry) -> Void) {
    Task { completion(await entries().first ?? placeholder(in: context)) }
  }

  func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<UsualEntry>) -> Void) {
    Task {
      let list = await entries()
      // Refresh soon when live data matters (bus within the hour), else at the next departure.
      let soon = list.first?.departure.map { $0.timeIntervalSinceNow < 3600 } ?? false
      let next = soon ? Date.now.addingTimeInterval(5 * 60) : (list.first?.departure ?? .now.addingTimeInterval(3600))
      completion(Timeline(entries: list.isEmpty ? [UsualEntry(date: .now)] : list, policy: .after(next)))
    }
  }

  private func entries() async -> [UsualEntry] {
    let buses = SharedStorage.load().usualBuses
    let now = Date.now
    // The next occurrences across usual buses, in order.
    let occs = buses.flatMap { u in u.nextOccurrences(from: now, count: 3).map { (u, $0) } }.sorted { $0.1.depart < $1.1.depart }.prefix(4)
    guard let (firstBus, firstOcc) = occs.first else { return [] }
    var live: Schedule?
    if firstOcc.depart.timeIntervalSince(now) < 3 * 3600, let r = try? await MBusAPI.shared.schedules(for: firstBus.leg, limit: 6, before: 1) {
      live = firstBus.match(in: r.schedules, on: firstOcc.date)
    }
    // Order by the effective (live) departure; each entry shows from the previous bus's departure on.
    let items = occs.enumerated()
      .map { i, pair in (pair.0, pair.1, i == 0 ? (live?.date ?? pair.1.depart) : pair.1.depart, i == 0 ? live : nil) }
      .sorted { $0.2 < $1.2 }
    var out: [UsualEntry] = []
    var start = now
    for (u, occ, depart, liveSchedule) in items where depart > start {
      let leave = depart.addingTimeInterval(-TimeInterval(u.walkMinutes * 60))
      let near = occ.notify.timeIntervalSince(start) < 15 * 60 || leave.timeIntervalSince(start) < 15 * 60
      out.append(UsualEntry(date: start, usual: u, departure: depart, live: liveSchedule,
                            relevance: TimelineEntryRelevance(score: near ? 100 : 10, duration: depart.timeIntervalSince(start))))
      start = depart.addingTimeInterval(60)
    }
    return out
  }
}

struct NextUsualWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: WidgetKinds.nextUsual, provider: UsualProvider()) { entry in
      NextUsualView(entry: entry)
        .containerBackground(for: .widget) { (entry.usual.map { Color.line($0.route, $0.routeColor) } ?? .mbusAccent).opacity(0.18) }
        .widgetURL(URL(string: "mbus://usual"))
    }
    .configurationDisplayName("Usual bus")
    .description("When to leave for your next usual bus.")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

struct NextUsualView: View {
  @Environment(\.widgetFamily) private var family
  var entry: UsualEntry

  var body: some View {
    if let u = entry.usual, let dep = entry.departure {
      switch family {
      case .accessoryInline:
        Text("\(u.route) \(LjubljanaTime.clock(dep)) · leave \(LjubljanaTime.clock(entry.leaveBy ?? dep))")
      case .accessoryCircular:
        VStack(spacing: 0) {
          Text(u.route).font(.caption2.weight(.heavy))
          Text(dep, style: .timer).font(.caption.monospacedDigit()).multilineTextAlignment(.center).minimumScaleFactor(0.6)
        }
        .widgetAccentable()
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 1) {
          Text("\(u.route) · \(u.stopName ?? "")").font(.headline).lineLimit(1).widgetAccentable()
          Text("Leave by \(LjubljanaTime.clock(entry.leaveBy ?? dep))").font(.caption)
          Text(dep, style: .relative).font(.caption).monospacedDigit()
        }
      default:
        VStack(alignment: .leading, spacing: 4) {
          HStack {
            RouteBadge(u.route, color: u.routeColor)
            Spacer()
            if entry.live?.isLive == true { Image(systemName: "dot.radiowaves.up.forward").foregroundStyle(.green) }
          }
          Spacer(minLength: 0)
          Text("Leave by").font(.caption2).foregroundStyle(.secondary)
          Text(LjubljanaTime.clock(entry.leaveBy ?? dep)).font(.title.weight(.bold)).monospacedDigit()
          Text("\(LjubljanaTime.clock(dep)) · \(u.stopName ?? "")").font(.caption).lineLimit(1).foregroundStyle(.secondary)
          if dep.timeIntervalSinceNow < 3600 {
            Text(dep, style: .timer).font(.caption.weight(.semibold)).monospacedDigit()
          } else if let day = dayLabel(dep) {
            Text(day).font(.caption.weight(.semibold))
          }
        }
      }
    } else {
      VStack(spacing: 4) {
        Image(systemName: "star").font(.title2)
        Text("Add a usual bus in MBus").font(.caption).multilineTextAlignment(.center)
      }
    }
  }
}

// MARK: Journey board (medium/large)

struct JourneyEntry: TimelineEntry {
  var date: Date
  var journey: Journey?
  var departures: [BoardDeparture]
}

struct JourneyProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> JourneyEntry {
    JourneyEntry(date: .now, journey: Defaults.journeys.first, departures: [])
  }

  func snapshot(for configuration: JourneyWidgetIntent, in context: Context) async -> JourneyEntry {
    await entry(for: configuration)
  }

  func timeline(for configuration: JourneyWidgetIntent, in context: Context) async -> Timeline<JourneyEntry> {
    let e = await entry(for: configuration)
    // Entries for each departure leaving, so the list shifts without a fetch.
    var entries = [e]
    for d in e.departures.prefix(3) {
      let after = d.date.addingTimeInterval(30)
      entries.append(JourneyEntry(date: after, journey: e.journey, departures: e.departures.filter { $0.date > after }))
    }
    return Timeline(entries: entries, policy: .after(.now.addingTimeInterval(10 * 60)))
  }

  private func entry(for configuration: JourneyWidgetIntent) async -> JourneyEntry {
    let state = SharedStorage.load()
    let journey = state.journeys.first { $0.id == configuration.journey?.id } ?? state.selectedJourney
    guard let journey else { return JourneyEntry(date: .now, journey: nil, departures: []) }
    let board = await Board.load(journey.stops, limit: 5, before: 0)
    return JourneyEntry(date: .now, journey: journey, departures: board.upcoming(at: .now))
  }
}

struct JourneyWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: WidgetKinds.journey, intent: JourneyWidgetIntent.self, provider: JourneyProvider()) { entry in
      JourneyWidgetView(entry: entry)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(entry.journey.map { URL(string: "mbus://journey/\($0.id)")! })
    }
    .configurationDisplayName("Journey")
    .description("The next buses on one of your journeys.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}

struct JourneyWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var entry: JourneyEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(entry.journey?.name ?? "MBus").font(.subheadline.weight(.semibold)).lineLimit(1)
        Spacer()
        Button(intent: TrackUsualBusIntent()) { Image(systemName: "dot.radiowaves.left.and.right") }
          .buttonStyle(.plain)
          .foregroundStyle(.tint)
          .accessibilityLabel("Track usual bus")
      }
      if entry.departures.isEmpty {
        Spacer()
        Text(entry.journey == nil ? "Add a journey in MBus" : "No more buses today").font(.footnote).foregroundStyle(.secondary)
        Spacer()
      }
      ForEach(entry.departures.prefix(family == .systemLarge ? 7 : 3)) { d in
        HStack(spacing: 8) {
          RouteBadge(d.route, color: d.routeColor, size: .small)
          VStack(alignment: .leading, spacing: 0) {
            Text(d.schedule.destination ?? d.stopName ?? "").font(.caption.weight(.medium)).lineLimit(1)
            if let arr = d.schedule.arrivalTime { Text("→ \(arr)").font(.caption2).foregroundStyle(.secondary) }
          }
          Spacer()
          if d.schedule.isLive { Image(systemName: "dot.radiowaves.up.forward").font(.caption2).foregroundStyle(.green) }
          Text(d.schedule.time).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
          if d.date.timeIntervalSinceNow < 3600 {
            Text(d.date, style: .timer).font(.subheadline.weight(.semibold).monospacedDigit()).frame(width: 52, alignment: .trailing)
          }
        }
      }
      Spacer(minLength: 0)
    }
  }
}

// MARK: Control Center / Lock Screen / Action button

struct TrackUsualControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: WidgetKinds.trackControl) {
      ControlWidgetButton(action: TrackUsualBusIntent()) {
        Label("Track Usual Bus", systemImage: "bus.fill")
      }
    }
    .displayName("Track Usual Bus")
    .description("Puts your next usual bus on the Lock Screen.")
  }
}

#Preview("Small", as: .systemSmall) {
  NextUsualWidget()
} timeline: {
  UsualEntry(date: .now, usual: UsualBus(stopId: "255", stopName: "Pohorska - pošta", route: "G6", time: "07:31", walkMinutes: 6), departure: .now.addingTimeInterval(14 * 60))
}
