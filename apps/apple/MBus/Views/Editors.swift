import MBusKit
import MBusUI
import SwiftUI
import UserNotifications

struct JourneysEditor: View {
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var editing: Journey?

  var body: some View {
    List {
      ForEach(store.journeys) { j in
        Button { editing = j } label: {
          VStack(alignment: .leading, spacing: 4) {
            Text(j.name).font(.headline)
            HStack(spacing: 4) {
              ForEach(j.stops, id: \.key) { RouteBadge($0.route, size: .small) }
              if let d = j.description { Text(d).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
            }
          }
        }
        .buttonStyle(.plain)
      }
      .onDelete { idx in idx.map { store.journeys[$0].id }.forEach(store.deleteJourney) }
      .onMove { from, to in store.update { $0.journeys.move(fromOffsets: from, toOffset: to) } }
    }
    .navigationTitle("Journeys")
    .toolbar {
      ToolbarItem(placement: .topBarLeading) { EditButton() }
      ToolbarItem(placement: .confirmationAction) { Button("Done", role: .confirm) { dismiss() } }
      ToolbarItem(placement: .bottomBar) {
        Button { editing = Journey(name: "", stops: []) } label: { Label("New journey", systemImage: "plus") }
      }
    }
    .sheet(item: $editing) { j in NavigationStack { JourneyEditor(journey: j) } }
  }
}

struct JourneyEditor: View {
  @Environment(AppStore.self) private var store
  @Environment(StopsCatalog.self) private var catalog
  @Environment(\.dismiss) private var dismiss
  @State var journey: Journey

  var body: some View {
    Form {
      Section {
        TextField("Name, e.g. 🏠 Home → 🏫 School", text: $journey.name)
        TextField("Note (optional)", text: Binding($journey.description, replacingNilWith: ""))
      } footer: {
        Text("Use → between from and to, so the board can say where you're going.")
      }
      ForEach(journey.stops.indices, id: \.self) { i in
        let leg = $journey.stops[i]
        Section {
          NavigationLink {
            StopPicker(title: "Board at") { leg.wrappedValue.stopId = $0.id }
          } label: {
            LabeledContent("Board at", value: catalog.name(leg.wrappedValue.stopId) ?? (leg.wrappedValue.stopId.isEmpty ? "Choose" : leg.wrappedValue.stopId))
          }
          RoutePicker(route: leg.route)
          NavigationLink {
            StopPicker(title: "Get off at", allowNone: true) { leg.wrappedValue.toStopId = $0?.id }
          } label: {
            LabeledContent("Get off at", value: catalog.name(leg.wrappedValue.toStopId) ?? "Optional")
          }
          Button("Remove", role: .destructive) { journey.stops.remove(at: i) }
        } header: {
          Text("Stop and line")
        }
      }
      Section {
        Button {
          journey.stops.append(StopRoute(stopId: journey.stops.last?.stopId ?? "", route: "G6"))
        } label: {
          Label("Add a stop or line", systemImage: "plus.circle")
        }
      } footer: {
        Text("Departures from every stop and line you add are merged into one board.")
      }
    }
    .navigationTitle(journey.name.isEmpty ? "New journey" : journey.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save", role: .confirm) {
          journey.stops.removeAll { $0.stopId.isEmpty }
          store.upsert(journey)
          dismiss()
        }
        .disabled(journey.name.isEmpty || !journey.stops.contains { !$0.stopId.isEmpty })
      }
    }
    .task { await catalog.loadIfNeeded() }
  }
}

/// Searchable list of every stop (name, sign number or ID), nearest first when located.
struct StopPicker: View {
  @Environment(StopsCatalog.self) private var catalog
  @Environment(\.dismiss) private var dismiss
  var title: String
  var allowNone = false
  var onPick: (Stop?) -> Void
  @State private var query = ""
  @State private var location = LocationProvider()

  init(title: String, allowNone: Bool = false, onPick: @escaping (Stop?) -> Void) {
    self.title = title
    self.allowNone = allowNone
    self.onPick = onPick
  }

  init(title: String, onPick: @escaping (Stop) -> Void) {
    self.title = title
    self.onPick = { if let s = $0 { onPick(s) } }
  }

  var body: some View {
    List {
      if allowNone {
        Button("None") { pick(nil) }
      }
      if query.isEmpty, let loc = location.location {
        Section("Near you") {
          ForEach(catalog.nearest(to: loc)) { row($0) }
        }
      }
      Section(query.isEmpty ? "All stops" : "Results") {
        ForEach(catalog.search(query).prefix(200)) { row($0) }
      }
      if catalog.stops.isEmpty {
        if catalog.failed { Text("Couldn't load the stop list.").foregroundStyle(.secondary) } else { ProgressView() }
      }
    }
    .searchable(text: $query, prompt: "Stop name or sign number")
    .navigationTitle(title)
    .task { await catalog.loadIfNeeded() }
    .task { await location.locate() }
  }

  private func row(_ s: Stop) -> some View {
    Button { pick(s) } label: {
      HStack {
        Text(s.name)
        Spacer()
        if let code = s.code { Text("#\(code)").font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
      }
    }
    .foregroundStyle(.primary)
  }

  private func pick(_ s: Stop?) {
    onPick(s)
    dismiss()
  }
}

struct SettingsView: View {
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var notifications: UNAuthorizationStatus = .notDetermined

  var body: some View {
    Form {
      Section {
        Toggle("Show approaching usual bus on Lock Screen", isOn: binding(\.autoLiveActivity))
        Toggle("Keep screen on when the bus is near", isOn: binding(\.keepAwake))
        Toggle("Reminders on Apple Watch", isOn: binding(\.watchReminders))
      } footer: {
        Text("Watch reminders are scheduled on the watch itself, so they arrive even when your iPhone isn't with you.")
      }
      Section("Notifications") {
        switch notifications {
        case .denied:
          Button("Turn on in Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
        case .notDetermined:
          Button("Allow reminders") { Task { await Reminders.requestAuthorization(); await refresh() } }
        default:
          Label("Reminders are on", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        }
      }
      Section("About") {
        LabeledContent("Data", value: "Marprom via mbus.vercel.app")
        Link("MBus on the web", destination: URL(string: "https://mbus.vercel.app")!)
        Text("MBus is an unofficial app. Real-time delays are available only for trips in Marprom's GTFS feed; other times come from the published timetable.")
          .font(.footnote).foregroundStyle(.secondary)
      }
    }
    .navigationTitle("Settings")
    .toolbar { Button("Done", role: .confirm) { dismiss() } }
    .task { await refresh() }
  }

  private func refresh() async { notifications = await Reminders.authorizationStatus() }

  private func binding(_ key: WritableKeyPath<AppState.Settings, Bool>) -> Binding<Bool> {
    Binding(get: { store.settings[keyPath: key] }, set: { v in store.update { $0.settings[keyPath: key] = v } })
  }
}
