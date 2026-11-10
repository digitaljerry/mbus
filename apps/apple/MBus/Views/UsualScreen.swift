import MBusKit
import MBusUI
import SwiftUI
import UserNotifications

struct UsualScreen: View {
  @Environment(AppModel.self) private var model
  @Environment(AppStore.self) private var store

  var body: some View {
    NavigationStack {
      List {
        if let a = model.approaching {
          Section { ApproachingCard(approaching: a).listRowInsets(.init()).listRowBackground(Color.clear) }
        }
        if store.usualBuses.isEmpty {
          ContentUnavailableView {
            Label("No usual buses", systemImage: "star")
          } description: {
            Text("Bookmark the bus you take regularly. MBus tells you when to leave, shows it on your Lock Screen as it approaches, and adjusts for delays.")
          } actions: {
            Button("Add a usual bus") { model.editingUsual = UsualBus(stopId: "", route: "G6", time: "07:30") }
              .buttonStyle(.glassProminent)
          }
        }
        ForEach(store.usualBuses) { u in
          Button { model.editingUsual = u } label: { UsualRow(usual: u) }
            .buttonStyle(.plain)
            .swipeActions {
              Button("Delete", role: .destructive) { store.deleteUsual(u.id) }
              Button("Track") { Task { _ = try? await BusActivities.trackUsual(u) } }.tint(.accentColor)
            }
        }
      }
      .navigationTitle("Usual buses")
      .toolbar {
        Button { model.editingUsual = UsualBus(stopId: "", route: "G6", time: "07:30") } label: { Image(systemName: "plus") }
          .accessibilityLabel("Add usual bus")
      }
    }
  }
}

struct UsualRow: View {
  var usual: UsualBus

  var body: some View {
    let next = usual.nextOccurrences().first
    HStack(spacing: 12) {
      RouteBadge(usual.route, color: usual.routeColor)
      VStack(alignment: .leading, spacing: 2) {
        Text(usual.title).font(.headline)
        Text("\(usual.time) from \(usual.stopName ?? "stop \(usual.stopId)")").font(.subheadline).foregroundStyle(.secondary)
        HStack(spacing: 6) {
          Text(usual.daysDescription)
          if usual.remind { Image(systemName: "bell.fill").accessibilityLabel("Reminder on") }
        }
        .font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      if let next {
        VStack(alignment: .trailing, spacing: 0) {
          Text("Leave by").font(.caption2).foregroundStyle(.secondary)
          Text(LjubljanaTime.clock(next.leave)).font(.headline).monospacedDigit()
          if let day = dayLabel(next.depart) { Text(day).font(.caption2).foregroundStyle(.secondary) }
        }
      }
    }
    .contentShape(.rect)
  }
}

struct UsualEditor: View {
  @Environment(AppStore.self) private var store
  @Environment(StopsCatalog.self) private var catalog
  @Environment(\.dismiss) private var dismiss
  @State var usual: UsualBus
  @State private var time = Date.now
  @State private var notificationsDenied = false

  private var isNew: Bool { !store.usualBuses.contains { $0.id == usual.id } }

  var body: some View {
    Form {
      Section {
        TextField("Name (optional), e.g. School run", text: Binding($usual.label, replacingNilWith: ""))
      }
      Section("Bus") {
        NavigationLink {
          StopPicker(title: "Stop") { stop in
            usual.stopId = stop.id
            usual.stopName = stop.name
          }
        } label: {
          LabeledContent("Stop", value: usual.stopName ?? catalog.name(usual.stopId) ?? "Choose")
        }
        RoutePicker(route: $usual.route)
        DatePicker("Timetable time", selection: $time, displayedComponents: .hourAndMinute)
          .environment(\.timeZone, LjubljanaTime.timeZone)
        NavigationLink {
          StopPicker(title: "Get off at", allowNone: true) { stop in
            usual.toStopId = stop?.id
            usual.toStopName = stop?.name
          }
        } label: {
          LabeledContent("Get off at", value: usual.toStopName ?? "Optional")
        }
      }
      Section("Days") {
        HStack {
          ForEach(1...7, id: \.self) { d in
            let on = usual.days.contains(d)
            Button(String(UsualBus.dayNames[d - 1].prefix(2))) {
              if on { usual.days.removeAll { $0 == d } } else { usual.days.append(d) }
            }
            .buttonStyle(on ? AnyPrimitiveButtonStyle(.glassProminent) : AnyPrimitiveButtonStyle(.glass))
            .font(.caption.weight(.semibold))
          }
        }
      }
      Section {
        Stepper("Walk to the stop: \(usual.walkMinutes) min", value: $usual.walkMinutes, in: 0...60)
        Toggle("Remind me to leave", isOn: $usual.remind)
        if usual.remind {
          Stepper("\(usual.remindBefore) min before leaving", value: $usual.remindBefore, in: 0...30)
        }
      } footer: {
        if notificationsDenied {
          Text("Notifications are off for MBus. Turn them on in Settings to get reminders.").foregroundStyle(.red)
        } else if let next = usual.nextOccurrences().first {
          Text("Next: leave by \(LjubljanaTime.clock(next.leave))\(dayLabel(next.depart).map { " \($0)" } ?? ""). When it's time, MBus notifies you and puts the bus on your Lock Screen with live delays.")
        }
      }
      if !isNew {
        Section {
          Button("Delete usual bus", role: .destructive) {
            store.deleteUsual(usual.id)
            dismiss()
          }
        }
      }
    }
    .navigationTitle(isNew ? "New usual bus" : usual.title)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save", role: .confirm) { save() }.disabled(usual.stopId.isEmpty || usual.days.isEmpty)
      }
    }
    .onAppear {
      time = LjubljanaTime.serviceTime(LjubljanaTime.dateString(), hhmm: usual.time) ?? .now
      Task { await catalog.loadIfNeeded() }
    }
    .onChange(of: time) { _, t in usual.time = LjubljanaTime.clock(t) }
    .onChange(of: usual.remind) { _, on in
      guard on else { return }
      Task { notificationsDenied = !(await Reminders.requestAuthorization()) }
    }
  }

  private func save() {
    usual.routeColor = RouteColors.hex(for: usual.route, other: usual.routeColor)
    let u = usual
    Task {
      // Ask first, so the reminders scheduled on save are allowed.
      if u.remind { notificationsDenied = !(await Reminders.requestAuthorization()) }
      store.upsert(u)
      dismiss()
    }
  }
}

struct RoutePicker: View {
  @Binding var route: String

  var body: some View {
    Picker("Line", selection: $route) {
      ForEach(RouteColors.knownRoutes + (RouteColors.knownRoutes.contains(route) ? [] : [route]), id: \.self) { r in
        Text(r).tag(r)
      }
    }
  }
}

extension Binding where Value == String {
  init(_ source: Binding<String?>, replacingNilWith fallback: String) {
    self.init(get: { source.wrappedValue ?? fallback }, set: { source.wrappedValue = $0.isEmpty ? nil : $0 })
  }
}
