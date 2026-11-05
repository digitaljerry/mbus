import MBusKit
import MBusUI
import SwiftUI

struct BoardScreen: View {
  @Environment(AppModel.self) private var model
  @Environment(AppStore.self) private var store
  @State private var showJourneys = false
  @State private var showSettings = false
  @State private var showEarlier = false

  var body: some View {
    NavigationStack {
      Group {
        if let journey = store.selectedJourney {
          board(journey)
        } else {
          ContentUnavailableView {
            Label("No journeys", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
          } description: {
            Text("Add the trips you take, like Home → School, to see their next buses.")
          } actions: {
            Button("Add a journey") { showJourneys = true }.buttonStyle(.glassProminent)
          }
        }
      }
      .navigationTitle(store.selectedJourney?.parts.to.map { "To \($0)" } ?? "MBus")
      .navigationSubtitle(store.selectedJourney.map { "From \($0.parts.from)" } ?? "")
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button { showSettings = true } label: { Image(systemName: "gearshape") }
            .accessibilityLabel("Settings")
        }
        ToolbarItem(placement: .topBarTrailing) {
          Button { showJourneys = true } label: { Image(systemName: "list.bullet") }
            .accessibilityLabel("Edit journeys")
        }
      }
      .sheet(isPresented: $showJourneys) { NavigationStack { JourneysEditor() } }
      .sheet(isPresented: $showSettings) { NavigationStack { SettingsView() } }
    }
  }

  @ViewBuilder
  private func board(_ journey: Journey) -> some View {
    let board = model.board(for: journey)
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 12, pinnedViews: []) {
        JourneyChips()
        if let a = model.approaching { ApproachingCard(approaching: a) }

        TimelineView(.periodic(from: .now, by: 15)) { ctx in
          let upcoming = board?.upcoming(at: ctx.date) ?? []
          if let board {
            if board.upcoming.contains(where: { SchoolHolidays.mayBeOff($0.schedule) }) {
              Label(SchoolHolidays.notice, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote).foregroundStyle(.orange).mbusCard()
            }
            if !board.earlier.isEmpty {
              DisclosureGroup(isExpanded: $showEarlier) {
                VStack(spacing: 8) {
                  ForEach(board.earlier) { d in DepartureRow(departure: d, dimmed: true) }
                }.padding(.top, 8)
              } label: {
                Label("Already left", systemImage: "clock.arrow.circlepath").font(.subheadline.weight(.medium))
              }
              .padding(.horizontal, 4)
            }
            if upcoming.isEmpty {
              ContentUnavailableView("No more buses", systemImage: "moon.zzz",
                                     description: Text(board.failedLegs.isEmpty ? "Nothing leaves today or tomorrow on this journey." : "Couldn't reach the timetable service."))
            }
            ForEach(Array(upcoming.enumerated()), id: \.element.id) { i, d in
              DepartureRow(departure: d, featured: i == 0)
                .onTapGesture { model.presentedDeparture = d }
            }
            footer(board)
          } else {
            ForEach(0..<4, id: \.self) { _ in DepartureRow.placeholder }
          }
        }
      }
      .padding(.horizontal)
      .padding(.bottom, 24)
      .frame(maxWidth: 720)
      .frame(maxWidth: .infinity)
    }
    .refreshable { await model.refresh(journey) }
    .task(id: journey.id) { if model.board(for: journey) == nil { await model.refresh(journey) } }
    .animation(.smooth, value: board?.upcoming.map(\.id))
  }

  private func footer(_ board: Board) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(board.notes, id: \.self) { Text($0) }
      if !board.failedLegs.isEmpty {
        Label("Some stops couldn't be loaded. Pull to retry.", systemImage: "wifi.exclamationmark")
      }
      HStack(spacing: 4) {
        Image(systemName: board.anyLive ? "dot.radiowaves.up.forward" : "calendar")
        Text(board.anyLive ? "Live data from Marprom's GTFS feed" : "Timetable times")
        Text("·")
        Text("updated \(board.fetchedAt, style: .relative) ago")
      }
    }
    .font(.caption).foregroundStyle(.secondary)
    .padding(.top, 4)
  }
}

/// Horizontal journey switcher.
struct JourneyChips: View {
  @Environment(AppStore.self) private var store

  var body: some View {
    ScrollView(.horizontal) {
      GlassEffectContainer(spacing: 8) {
        HStack(spacing: 8) {
          ForEach(store.journeys) { j in
            let selected = j.id == store.selectedJourney?.id
            Button {
              withAnimation(.snappy) { store.select(j) }
            } label: {
              Text(j.parts.to.map { "\(j.parts.from) → \($0)" } ?? j.name)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .lineLimit(1)
            }
            .buttonStyle(selected ? AnyPrimitiveButtonStyle(.glassProminent) : AnyPrimitiveButtonStyle(.glass))
          }
        }
        .padding(.vertical, 4)
      }
    }
    .scrollIndicators(.hidden)
    .scrollClipDisabled()
  }
}

struct AnyPrimitiveButtonStyle: PrimitiveButtonStyle {
  private let make: (Configuration) -> AnyView
  init<S: PrimitiveButtonStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
  func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

struct DepartureRow: View {
  @Environment(AppStore.self) private var store
  var departure: BoardDeparture
  var featured = false
  var dimmed = false

  var body: some View {
    let s = departure.schedule
    HStack(alignment: .center, spacing: 12) {
      RouteBadge(departure.route, color: departure.routeColor, size: featured ? .large : .regular)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Text(s.destination ?? departure.stopName ?? "")
            .font(featured ? .headline : .subheadline.weight(.medium))
            .lineLimit(1)
          if store.usual(for: departure) != nil {
            Image(systemName: "star.fill").font(.caption2).foregroundStyle(.yellow).accessibilityLabel("Usual bus")
          }
        }
        HStack(spacing: 6) {
          Text(timeText).monospacedDigit()
          if let stop = departure.stopName, departure.leg.stopId != store.selectedJourney?.stops.first?.stopId || featured {
            Text("· \(stop)").lineLimit(1)
          }
        }
        .font(.caption).foregroundStyle(.secondary)
        if let arr = s.arrivalTime {
          Label("\(s.arrivalEstimated == true ? "~" : "")\(arr) at \(departure.toStopName ?? "destination")", systemImage: "flag.checkered")
            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        if !dimmed { StatusPill(s) }
      }
      Spacer(minLength: 4)
      VStack(alignment: .trailing, spacing: 2) {
        if let day = dayLabel(departure.date) { Text(day).font(.caption2.weight(.semibold)).foregroundStyle(.secondary) }
        CountdownLabel(departure.date)
        if BusActivities.isTracking(departure) {
          Image(systemName: "dot.radiowaves.left.and.right").font(.caption).foregroundStyle(.tint).accessibilityLabel("Tracking")
        }
      }
    }
    .opacity(dimmed ? 0.55 : 1)
    .mbusCard(tint: featured ? Color.line(departure.route, departure.routeColor) : nil)
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }

  private var timeText: String {
    let s = departure.schedule
    if let sched = s.scheduledTime, sched != s.time { return "\(s.time) (was \(sched))" }
    return s.time
  }

  static var placeholder: some View {
    HStack {
      RoundedRectangle(cornerRadius: 7).frame(width: 40, height: 24)
      VStack(alignment: .leading) {
        RoundedRectangle(cornerRadius: 4).frame(width: 160, height: 14)
        RoundedRectangle(cornerRadius: 4).frame(width: 90, height: 10)
      }
      Spacer()
      RoundedRectangle(cornerRadius: 6).frame(width: 50, height: 24)
    }
    .foregroundStyle(.quaternary)
    .mbusCard()
    .redacted(reason: .placeholder)
  }
}

/// "Your usual bus is coming": leave-by countdown with a Track button.
struct ApproachingCard: View {
  @Environment(AppModel.self) private var model
  var approaching: AppModel.Approaching

  var body: some View {
    let u = approaching.usual
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Label(approaching.phase == .approaching ? "Time to leave" : "Your usual bus is coming", systemImage: "figure.walk")
          .font(.subheadline.weight(.semibold))
        Spacer()
        if let live = approaching.live, live.isLive { StatusPill(live) }
      }
      HStack(alignment: .firstTextBaseline) {
        RouteBadge(u.route, color: u.routeColor)
        VStack(alignment: .leading) {
          Text("\(LjubljanaTime.clock(approaching.departure)) from \(u.stopName ?? "your stop")").font(.headline)
          Text("Leave by \(LjubljanaTime.clock(approaching.leaveBy)) · \(u.walkMinutes) min walk").font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        CountdownLabel(approaching.leaveBy)
      }
      Button {
        Task { await model.trackApproaching() }
      } label: {
        Label("Track on Lock Screen", systemImage: "dot.radiowaves.left.and.right").frame(maxWidth: .infinity)
      }
      .buttonStyle(.glassProminent)
    }
    .mbusCard(tint: .yellow)
  }
}
