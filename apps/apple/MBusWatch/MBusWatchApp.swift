import MBusKit
import MBusUI
import SwiftUI
import UserNotifications
import WatchConnectivity
import WatchKit
import WidgetKit

/// Independent watch app: it calls the MBus API itself (Wi‑Fi or cellular), so it
/// works with the iPhone away. Journeys and usual buses arrive from the iPhone
/// through WatchConnectivity and are kept in the watch's own App Group.
@main
struct MBusWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchDelegate.self) private var delegate
  @State private var model = WatchModel()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      WatchRoot()
        .environment(model)
        .environment(model.store)
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await model.becameActive() } }
      if phase == .background { WatchRefresh.schedule(for: model.store.usualBuses) }
    }
    .backgroundTask(.appRefresh(WatchRefresh.identifier)) {
      await WatchRefresh.run()
    }
  }
}

final class WatchDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
  func applicationDidFinishLaunching() {
    UNUserNotificationCenter.current().delegate = self
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    [.banner, .sound, .list]
  }
}

@MainActor
@Observable
final class WatchModel {
  let store = AppStore()
  let api = MBusAPI.shared
  private(set) var boards: [String: Board] = [:]
  private(set) var approaching: (usual: UsualBus, departure: Date, live: Schedule?)?
  private(set) var offline = false

  init() {
    store.onChange = { state in
      WidgetCenter.shared.reloadAllTimelines()
      Task { await WatchReminders.reschedule(state) }
    }
    WatchSync.shared.onReceive = { [weak self] remote in self?.store.merge(remote: remote) }
    WatchSync.shared.activate()
  }

  func becameActive() async {
    store.reloadFromDisk()
    await WatchReminders.reschedule(store.state)
    await checkUsual()
  }

  func refresh(_ j: Journey) async {
    let b = await Board.load(j.stops, api: api, limit: 5, before: 1)
    offline = b.isEmpty && !b.failedLegs.isEmpty
    if !b.isEmpty || boards[j.id] == nil { boards[j.id] = b }
  }

  @ObservationIgnored private var liveCache: [String: Schedule] = [:]

  func checkUsual() async {
    let buses = store.usualBuses
    // The bus that's due, plus any that may be running late.
    var targets = UsualApproach.possiblyLate(buses)
    if let (u, occ, _) = UsualApproach.current(buses, live: liveCache.mapValues(\.date)) { targets.insert((u, occ), at: 0) }
    for (u, occ) in targets.prefix(2) {
      if let r = try? await api.schedules(for: u.leg, limit: 6, before: 3),
         let s = u.match(in: (r.earlier ?? []) + r.schedules, on: occ.date) { liveCache[occ.key] = s }
    }
    guard let (u, occ, _) = UsualApproach.current(buses, live: liveCache.mapValues(\.date)) else {
      approaching = nil
      return
    }
    approaching = (u, occ.depart, liveCache[occ.key])
  }
}

/// Receives the user's setup from the iPhone.
final class WatchSync: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = WatchSync()
  @MainActor var onReceive: ((AppState) -> Void)?

  @MainActor func activate() {
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    // The latest context is kept by the system; read it in case it arrived while we weren't running.
    receive(session.receivedApplicationContext)
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    receive(context)
  }

  private nonisolated func receive(_ payload: [String: Any]) {
    guard let data = payload["state"] as? Data, let state = try? JSONDecoder().decode(AppState.self, from: data) else { return }
    Task { @MainActor in self.onReceive?(state) }
  }
}

/// Usual-bus reminders scheduled on the watch, so they fire without the iPhone.
/// They use the same identifiers as the iPhone's.
enum WatchReminders {
  static func reschedule(_ state: AppState) async {
    let center = UNUserNotificationCenter.current()
    let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("usual:") }
    center.removePendingNotificationRequests(withIdentifiers: pending)
    guard state.settings.watchReminders else { return }
    let delivered = Set(await center.deliveredNotifications().map(\.request.identifier))
    let plan = ReminderPlanner.plan(state.usualBuses, delivered: delivered)
    guard !plan.isEmpty else { return }
    if await center.notificationSettings().authorizationStatus == .notDetermined {
      _ = try? await center.requestAuthorization(options: [.alert, .sound])
    }
    for r in plan.prefix(24) {
      let content = UNMutableNotificationContent()
      content.title = r.title
      content.body = r.body
      content.sound = .default
      content.interruptionLevel = .timeSensitive
      content.threadIdentifier = "usual"
      content.userInfo = ["usualId": r.usualId]
      let comps = LjubljanaTime.calendar.dateComponents(in: LjubljanaTime.timeZone, from: r.fireDate)
      try? await center.add(UNNotificationRequest(identifier: r.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
    }
  }
}

enum WatchRefresh {
  static let identifier = "dev.zorec.mbus.watch.refresh"

  static func schedule(for buses: [UsualBus]) {
    let next = buses.compactMap { $0.nextOccurrences().first?.notify }.min()
    let date = max(next?.addingTimeInterval(-15 * 60) ?? .now.addingTimeInterval(3600), .now.addingTimeInterval(15 * 60))
    // SwiftUI's .backgroundTask(.appRefresh(id)) matches the id passed as userInfo.
    WKApplication.shared().scheduleBackgroundRefresh(withPreferredDate: date, userInfo: identifier as NSString) { _ in }
  }

  static func run() async {
    WidgetCenter.shared.reloadAllTimelines()
    let state = SharedStorage.load()
    await WatchReminders.reschedule(state)
    await MainActor.run { schedule(for: state.usualBuses) }
  }
}
