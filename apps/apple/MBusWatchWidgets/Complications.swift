import MBusKit
import MBusUI
import SwiftUI
import WidgetKit

/// Watch face complications and Smart Stack: the next usual bus.
@main
struct MBusWatchWidgets: WidgetBundle {
  var body: some Widget {
    NextBusComplication()
  }
}

struct ComplicationEntry: TimelineEntry {
  var date: Date
  var usual: UsualBus?
  var departure: Date?
  var relevance: TimelineEntryRelevance?
}

struct ComplicationProvider: TimelineProvider {
  func placeholder(in context: Context) -> ComplicationEntry {
    ComplicationEntry(date: .now, usual: UsualBus(stopId: "255", route: "G6", time: "07:31"), departure: .now.addingTimeInterval(600))
  }

  func getSnapshot(in context: Context, completion: @escaping @Sendable (ComplicationEntry) -> Void) {
    Task { completion(await entries().first ?? placeholder(in: context)) }
  }

  func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<ComplicationEntry>) -> Void) {
    Task {
      let list = await entries()
      let refresh = list.first?.departure.map { $0.timeIntervalSinceNow < 3600 ? Date.now.addingTimeInterval(10 * 60) : $0 } ?? .now.addingTimeInterval(3600)
      completion(Timeline(entries: list.isEmpty ? [ComplicationEntry(date: .now)] : list, policy: .after(refresh)))
    }
  }

  private func entries() async -> [ComplicationEntry] {
    let buses = SharedStorage.load().usualBuses
    let occs = buses.flatMap { u in u.nextOccurrences(count: 2).map { (u, $0) } }.sorted { $0.1.depart < $1.1.depart }.prefix(3)
    guard let (u0, o0) = occs.first else { return [] }
    // Live time for the first one, straight from the API (works on cellular).
    var firstDepart = o0.depart
    if o0.depart.timeIntervalSinceNow < 2 * 3600, let r = try? await MBusAPI.shared.schedules(for: u0.leg, limit: 6, before: 1),
       let s = u0.match(in: r.schedules, on: o0.date) {
      firstDepart = s.date
    }
    // Order by effective departure; dates never go backwards.
    let items = occs.enumerated().map { i, pair in (pair.0, pair.1, i == 0 ? firstDepart : pair.1.depart) }.sorted { $0.2 < $1.2 }
    var start = Date.now
    var out: [ComplicationEntry] = []
    for (u, occ, depart) in items where depart > start {
      let near = occ.notify.timeIntervalSince(start) < 15 * 60
      out.append(ComplicationEntry(date: start, usual: u, departure: depart,
                                   relevance: TimelineEntryRelevance(score: near ? 100 : 5, duration: depart.timeIntervalSince(start))))
      start = depart.addingTimeInterval(60)
    }
    return out
  }
}

struct NextBusComplication: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NextUsualBusWatch", provider: ComplicationProvider()) { entry in
      ComplicationView(entry: entry)
        .containerBackground((entry.usual.map { Color.line($0.route, $0.routeColor) } ?? .mbusAccent).gradient, for: .widget)
    }
    .configurationDisplayName("Usual bus")
    .description("Countdown to your next usual bus.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
  }
}

struct ComplicationView: View {
  @Environment(\.widgetFamily) private var family
  var entry: ComplicationEntry

  var body: some View {
    if let u = entry.usual, let dep = entry.departure {
      let leave = dep.addingTimeInterval(-TimeInterval(u.walkMinutes * 60))
      switch family {
      case .accessoryInline:
        Text("\(u.route) · leave \(LjubljanaTime.clock(leave))")
      case .accessoryCorner:
        Text(u.route).font(.caption.weight(.heavy))
          .widgetLabel { Text(dep, style: .timer).monospacedDigit() }
      case .accessoryRectangular:
        VStack(alignment: .leading, spacing: 0) {
          Text("\(u.route) \(LjubljanaTime.clock(dep))").font(.headline).widgetAccentable()
          Text("Leave by \(LjubljanaTime.clock(leave))").font(.caption)
          Text(dep, style: .relative).font(.caption2).monospacedDigit()
        }
      default:
        VStack(spacing: -2) {
          Text(u.route).font(.system(size: 11, weight: .heavy)).widgetAccentable()
          Text(dep, style: .timer).font(.system(size: 12).monospacedDigit()).multilineTextAlignment(.center).minimumScaleFactor(0.5)
        }
      }
    } else {
      Image(systemName: "bus.fill").widgetAccentable()
    }
  }
}
