import BackgroundTasks
import Foundation
import MBusKit
import UserNotifications
import WidgetKit

/// Usual-bus reminders as time-sensitive local notifications: they work offline,
/// and background refresh moves them when the bus is late.
enum Reminders {
  static let center = UNUserNotificationCenter.current()

  static func registerCategories() {
    let track = UNNotificationAction(identifier: ReminderPlanner.trackActionId, title: "Track on Lock Screen",
                                     options: [.foreground], icon: UNNotificationActionIcon(systemImageName: "bus.fill"))
    let category = UNNotificationCategory(identifier: ReminderPlanner.categoryId, actions: [track], intentIdentifiers: [],
                                          options: [.customDismissAction])
    center.setNotificationCategories([category])
  }

  @discardableResult
  static func requestAuthorization() async -> Bool {
    (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
  }

  static func authorizationStatus() async -> UNAuthorizationStatus {
    await center.notificationSettings().authorizationStatus
  }

  /// Live departures for usual buses leaving in the next 3 hours, keyed by occurrence.
  static func liveDepartures(for buses: [UsualBus], api: MBusAPI, now: Date = .now) async -> [String: Schedule] {
    let soon = buses.filter { $0.remind }.compactMap { u -> (UsualBus, Occurrence)? in
      guard let occ = u.nextOccurrences(from: now).first, occ.depart.timeIntervalSince(now) < 3 * 3600 else { return nil }
      return (u, occ)
    }
    var out: [String: Schedule] = [:]
    await withTaskGroup(of: (String, Schedule?).self) { group in
      for (u, occ) in soon {
        group.addTask {
          let r = try? await api.schedules(for: u.leg, limit: 8, before: 2)
          return (occ.key, r.flatMap { u.match(in: ($0.earlier ?? []) + $0.schedules, on: occ.date) })
        }
      }
      for await (key, s) in group { if let s, s.isLive { out[key] = s } }
    }
    return out
  }

  static func reschedule(_ buses: [UsualBus], live: [String: Schedule] = [:]) async {
    let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("usual:") }
    center.removePendingNotificationRequests(withIdentifiers: pending)
    let delivered = Set(await center.deliveredNotifications().map(\.request.identifier))
    let plan = ReminderPlanner.plan(buses, live: live, delivered: delivered)
    // Permission is asked for in context (turning a reminder on), never on launch.
    guard !plan.isEmpty, await authorizationStatus() != .denied else { return }
    for r in plan {
      let content = UNMutableNotificationContent()
      content.title = r.title
      content.body = r.body
      content.sound = .default
      content.interruptionLevel = .timeSensitive
      content.relevanceScore = 1
      content.categoryIdentifier = ReminderPlanner.categoryId
      content.threadIdentifier = "usual"
      content.targetContentIdentifier = r.usualId
      content.userInfo = ["usualId": r.usualId, "departure": r.departure.timeIntervalSince1970]
      let comps = LjubljanaTime.calendar.dateComponents(in: LjubljanaTime.timeZone, from: r.fireDate)
      let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
      try? await center.add(UNNotificationRequest(identifier: r.id, content: content, trigger: trigger))
    }
  }
}

/// `BGAppRefreshTask`: wakes before a usual bus is due to check live data,
/// move its reminder and refresh Live Activities.
enum BackgroundRefresh {
  static let identifier = "dev.zorec.mbus.refresh"

  static func schedule(for buses: [UsualBus], now: Date = .now) {
    let nextNotify = buses.filter(\.remind).compactMap { $0.nextOccurrences(from: now).first?.notify }.filter { $0 > now }.min()
    // Wake ~20 min before the next reminder, or every 2 hours otherwise.
    var earliest = nextNotify.map { $0.addingTimeInterval(-20 * 60) } ?? now.addingTimeInterval(2 * 3600)
    earliest = max(earliest, now.addingTimeInterval(15 * 60))
    let request = BGAppRefreshTaskRequest(identifier: identifier)
    request.earliestBeginDate = earliest
    try? BGTaskScheduler.shared.submit(request)
  }

  /// Runs in the background (SwiftUI `.backgroundTask(.appRefresh)`).
  static func run() async {
    let state = SharedStorage.load()
    let live = await Reminders.liveDepartures(for: state.usualBuses, api: .shared)
    await Reminders.reschedule(state.usualBuses, live: live)
    await BusActivities.refreshAll()
    WidgetCenter.shared.reloadAllTimelines()
    schedule(for: state.usualBuses)
  }
}
