import MBusKit
import MBusUI
import SwiftUI

struct WatchRoot: View {
  @Environment(WatchModel.self) private var model
  @Environment(AppStore.self) private var store
  @State private var path: [Journey] = []

  var body: some View {
    NavigationStack(path: $path) {
      List {
        if let a = model.approaching {
          Section {
            NavigationLink { UsualDetail(usual: a.usual) } label: {
              VStack(alignment: .leading, spacing: 2) {
                HStack {
                  RouteBadge(a.usual.route, color: a.usual.routeColor, size: .small)
                  Spacer()
                  CountdownLabel(a.departure).font(.headline)
                }
                Text("Leave by \(LjubljanaTime.clock(a.departure.addingTimeInterval(-TimeInterval(a.usual.walkMinutes * 60))))")
                  .font(.caption2)
                if let live = a.live { StatusPill(live) }
              }
            }
            .listRowBackground(Color.line(a.usual.route, a.usual.routeColor).opacity(0.3).clipShape(.rect(cornerRadius: 12)))
          } header: {
            Text("Time to go")
          }
        }
        Section("Journeys") {
          ForEach(store.journeys) { j in
            NavigationLink(value: j) {
              VStack(alignment: .leading) {
                Text(j.parts.to ?? j.name).font(.headline).lineLimit(1)
                Text(j.parts.from).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
              }
            }
          }
        }
        if !store.usualBuses.isEmpty {
          Section("Usual buses") {
            ForEach(store.usualBuses) { u in
              NavigationLink { UsualDetail(usual: u) } label: {
                HStack {
                  RouteBadge(u.route, color: u.routeColor, size: .small)
                  VStack(alignment: .leading) {
                    Text(u.title).font(.caption.weight(.semibold)).lineLimit(1)
                    if let next = u.nextOccurrences().first {
                      Text("Leave \(LjubljanaTime.clock(next.leave))\(dayLabel(next.depart).map { " · \($0)" } ?? "")").font(.caption2).foregroundStyle(.secondary)
                    }
                  }
                }
              }
            }
          }
        }
        if store.journeys.isEmpty {
          Text("Set up journeys in MBus on your iPhone.").font(.footnote).foregroundStyle(.secondary)
        }
      }
      .navigationTitle("MBus")
      .navigationDestination(for: Journey.self) { WatchBoard(journey: $0) }
      .onAppear {
        #if DEBUG
        // `-MBusJourney <id>` opens a journey straight away (simulator checks).
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-MBusJourney"), i + 1 < args.count, let j = store.journeys.first(where: { $0.id == args[i + 1] }) {
          path = [j]
        }
        #endif
      }
      .task {
        while !Task.isCancelled {
          await model.checkUsual()
          try? await Task.sleep(for: .seconds(30))
        }
      }
    }
  }
}

struct WatchBoard: View {
  @Environment(WatchModel.self) private var model
  var journey: Journey

  var body: some View {
    let board = model.boards[journey.id]
    List {
      if let board {
        let upcoming = board.upcoming(at: .now)
        if upcoming.isEmpty {
          Text(model.offline ? "No connection. Check Wi‑Fi or cellular." : "No more buses today.").font(.footnote)
        }
        ForEach(upcoming.prefix(8)) { d in
          VStack(alignment: .leading, spacing: 2) {
            HStack {
              RouteBadge(d.route, color: d.routeColor, size: .small)
              Spacer()
              CountdownLabel(d.date).font(.title3)
            }
            Text(d.schedule.destination ?? "").font(.caption2).lineLimit(1)
            HStack(spacing: 4) {
              Text(d.schedule.time).monospacedDigit()
              if let arr = d.schedule.arrivalTime { Text("→ \(arr)") }
              if d.schedule.isLive { Image(systemName: "dot.radiowaves.up.forward").foregroundStyle(.green) }
            }
            .font(.caption2).foregroundStyle(.secondary)
          }
        }
      } else {
        ProgressView()
      }
    }
    .navigationTitle(journey.parts.to ?? journey.name)
    .task(id: journey.id) {
      while !Task.isCancelled {
        await model.refresh(journey)
        try? await Task.sleep(for: .seconds(30))
      }
    }
  }
}

struct UsualDetail: View {
  @Environment(WatchModel.self) private var model
  var usual: UsualBus
  @State private var live: Schedule?

  var body: some View {
    let occ = usual.nextOccurrences(from: .now.addingTimeInterval(-60)).first
    let depart = live?.date ?? occ?.depart
    ScrollView {
      VStack(spacing: 8) {
        RouteBadge(usual.route, color: usual.routeColor, size: .large)
        if let depart {
          CountdownLabel(depart, style: .compact).font(.largeTitle)
          Text("\(LjubljanaTime.clock(depart)) from \(usual.stopName ?? "stop")").font(.caption).multilineTextAlignment(.center)
          Text("Leave by \(LjubljanaTime.clock(depart.addingTimeInterval(-TimeInterval(usual.walkMinutes * 60))))").font(.headline)
        }
        if let live { StatusPill(live) }
      }
    }
    .navigationTitle(usual.title)
    .task {
      guard let occ, let r = try? await model.api.schedules(for: usual.leg, limit: 6, before: 2) else { return }
      live = usual.match(in: (r.earlier ?? []) + r.schedules, on: occ.date)
    }
  }
}
