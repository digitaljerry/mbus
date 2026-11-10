import MBusKit
import MBusUI
import SwiftUI

/// The departure sheet: swipe sideways (or tap the arrows) for the previous
/// and next bus on the same board.
struct DeparturePager: View {
  var departures: [BoardDeparture]
  @State private var current: String?

  init(start: BoardDeparture, departures: [BoardDeparture]) {
    self.departures = departures.contains { $0.id == start.id } ? departures : [start]
    _current = State(initialValue: start.id)
  }

  private var index: Int { departures.firstIndex { $0.id == current } ?? 0 }

  var body: some View {
    ScrollView(.horizontal) {
      LazyHStack(spacing: 0) {
        ForEach(departures) { d in
          DepartureDetail(departure: d)
            .containerRelativeFrame(.horizontal)
            .id(d.id)
        }
      }
      .scrollTargetLayout()
    }
    .scrollTargetBehavior(.paging)
    .scrollPosition(id: $current)
    .scrollIndicators(.hidden)
    .safeAreaInset(edge: .top, spacing: 0) {
      if departures.count > 1 { pagerBar }
    }
  }

  private var pagerBar: some View {
    HStack {
      Button { go(-1) } label: { Image(systemName: "chevron.left").frame(width: 28, height: 28) }
        .disabled(index == 0)
        .accessibilityLabel("Previous bus")
      Spacer()
      Text(position).font(.footnote.weight(.medium)).foregroundStyle(.secondary).monospacedDigit()
        .contentTransition(.numericText())
      Spacer()
      Button { go(1) } label: { Image(systemName: "chevron.right").frame(width: 28, height: 28) }
        .disabled(index >= departures.count - 1)
        .accessibilityLabel("Next bus")
    }
    .buttonStyle(.glass)
    .buttonBorderShape(.circle)
    .padding(.horizontal)
    .padding(.top, 14)
  }

  private var position: String {
    let d = departures[index]
    let next = departures.firstIndex { $0.date.timeIntervalSinceNow > -30 }
    if let next, index == next { return "Next bus · \(index + 1) of \(departures.count)" }
    if d.date.timeIntervalSinceNow <= -30 { return "Already left · \(index + 1) of \(departures.count)" }
    return "\(index + 1) of \(departures.count)"
  }

  private func go(_ step: Int) {
    let i = min(max(index + step, 0), departures.count - 1)
    withAnimation(.smooth) { current = departures[i].id }
  }
}

/// Countdown for one bus, with Track and "make usual".
struct DepartureDetail: View {
  @Environment(AppModel.self) private var model
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  var departure: BoardDeparture
  @State private var tracking = false
  @State private var error: String?

  var body: some View {
    let s = departure.schedule
    let usual = store.usual(for: departure)
    ScrollView {
      VStack(spacing: 18) {
        HStack(spacing: 12) {
          RouteBadge(departure.route, color: departure.routeColor, size: .large)
          VStack(alignment: .leading) {
            Text(s.destination ?? "").font(.headline).lineLimit(2)
            Text(departure.stopName ?? "").font(.subheadline).foregroundStyle(.secondary)
          }
          Spacer()
        }
        CountdownLabel(departure.date, style: .hero)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
        HStack(spacing: 10) {
          StatusPill(s)
          if let day = dayLabel(departure.date) { Text(day).font(.caption.weight(.semibold)) }
        }
        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
          GridRow {
            Text("Departs").foregroundStyle(.secondary)
            Text(s.time).monospacedDigit().bold()
          }
          if let sched = s.scheduledTime, sched != s.time {
            GridRow {
              Text("Timetable").foregroundStyle(.secondary)
              Text(sched).monospacedDigit()
            }
          }
          if let arr = s.arrivalTime {
            GridRow {
              Text("Arrives").foregroundStyle(.secondary)
              Text("\(s.arrivalEstimated == true ? "~" : "")\(arr) at \(departure.toStopName ?? "destination")").monospacedDigit()
            }
          }
          if let u = usual {
            GridRow {
              Text("Leave by").foregroundStyle(.secondary)
              Text(LjubljanaTime.clock(departure.date.addingTimeInterval(-TimeInterval(u.walkMinutes * 60)))).monospacedDigit().bold()
            }
          }
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, alignment: .leading)
        .mbusCard()

        if SchoolHolidays.mayBeOff(s) {
          Label(SchoolHolidays.notice, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange)
        }

        GlassEffectContainer(spacing: 10) {
          VStack(spacing: 10) {
            Button {
              Task { await toggleTracking() }
            } label: {
              Label(tracking ? "Stop tracking" : "Track on Lock Screen", systemImage: tracking ? "stop.circle" : "dot.radiowaves.left.and.right")
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)

            HStack(spacing: 10) {
              Button {
                if let usual {
                  model.editingUsual = usual
                } else {
                  model.editingUsual = UsualBus(stopId: departure.leg.stopId, stopName: departure.stopName, route: departure.route,
                                                routeColor: departure.routeColor, destination: s.destination,
                                                time: s.scheduledTime ?? s.time, days: [LjubljanaTime.isoWeekday(departure.date)],
                                                toStopId: departure.leg.toStopId, toStopName: departure.toStopName)
                }
                dismiss()
              } label: {
                Label(usual == nil ? "Make usual" : "Edit usual", systemImage: usual == nil ? "star" : "star.fill").frame(maxWidth: .infinity)
              }
              Button {
                model.selectedTab = .map
                dismiss()
              } label: {
                Label("Map", systemImage: "map").frame(maxWidth: .infinity)
              }
            }
            .buttonStyle(.glass)
            .controlSize(.large)
          }
        }
        if let error { Text(error).font(.footnote).foregroundStyle(.red) }
      }
      .padding()
    }
    .background(alignment: .top) {
      // The line's own colour, fading out behind the countdown.
      LinearGradient(colors: [Color.line(departure.route, departure.routeColor).opacity(0.28), .clear], startPoint: .top, endPoint: .bottom)
        .frame(height: 320)
        .ignoresSafeArea()
    }
    .onAppear { tracking = BusActivities.isTracking(departure) }
  }

  private func toggleTracking() async {
    if tracking {
      await BusActivities.end(BusActivityInfo(departure))
      tracking = false
      return
    }
    guard BusActivities.enabled else {
      error = "Live Activities are off for MBus. Turn them on in Settings › MBus."
      return
    }
    do {
      try await BusActivities.start(departure, usual: store.usual(for: departure))
      tracking = true
    } catch {
      self.error = error.localizedDescription
    }
  }
}
