import Foundation
import MBusKit
import Observation
import SwiftUI
import UIKit
import WidgetKit

/// App-wide state: the user's setup (`AppStore`), live boards, and the
/// "usual bus approaching" monitor.
@MainActor
@Observable
final class AppModel {
  let store: AppStore
  let stops = StopsCatalog()
  let api = MBusAPI.shared

  private(set) var boards: [String: Board] = [:]
  private(set) var loading: Set<String> = []
  var selectedTab: AppTab = .departures
  var presentedDeparture: BoardDeparture?
  var editingUsual: UsualBus?

  /// The usual bus that is due soon or now, with its live departure if known.
  private(set) var approaching: Approaching?

  struct Approaching: Equatable {
    var usual: UsualBus
    var occurrence: Occurrence
    var phase: UsualApproach.Phase
    var live: Schedule?
    var departure: Date { live?.date ?? occurrence.depart }
    var leaveBy: Date { departure.addingTimeInterval(-TimeInterval(usual.walkMinutes * 60)) }
  }

  @ObservationIgnored private var ticker: Task<Void, Never>?
  @ObservationIgnored private var lastReminderSync = Date.distantPast
  @ObservationIgnored private var lastUsualFetch = Date.distantPast
  /// Occurrences we already started a Live Activity for (so dismissing one sticks).
  @ObservationIgnored private var autoStarted: [String] = UserDefaults.standard.stringArray(forKey: "autoStarted") ?? []
  /// Live departures for usual-bus occurrences, by occurrence key.
  @ObservationIgnored private var liveCache: [String: Schedule] = [:]

  init() {
    store = AppStore()
    store.onChange = { [weak self] state in self?.stateChanged(state) }
    PhoneSync.shared.onReceive = { [weak self] remote in self?.store.merge(remote: remote) }
    PhoneSync.shared.activate(sending: store.state)
    #if DEBUG
    // `-MBusURL mbus://map` opens a deep link at launch (simulator checks).
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-MBusURL"), i + 1 < args.count, let url = URL(string: args[i + 1]) { open(url) }
    // `-MBusDeparture 2` opens the sheet for the third upcoming bus once the board loads.
    if let i = args.firstIndex(of: "-MBusDeparture"), i + 1 < args.count, let n = Int(args[i + 1]) {
      Task {
        for _ in 0..<40 {
          try? await Task.sleep(for: .milliseconds(500))
          if let j = selectedJourney, let list = board(for: j)?.upcoming(at: .now), list.count > n {
            presentedDeparture = list[n]
            return
          }
        }
      }
    }
    #endif
  }

  var selectedJourney: Journey? { store.selectedJourney }
  func board(for j: Journey) -> Board? { boards[j.id] }

  /// The board a departure belongs to, in time order, so its sheet can page
  /// to the previous and next bus. Just the departure itself if it's not on a board.
  func siblings(of d: BoardDeparture) -> [BoardDeparture] {
    for board in boards.values {
      let all = (board.earlier + board.upcoming).sorted { $0.date < $1.date }
      if all.contains(where: { $0.id == d.id }) { return all }
    }
    return [d]
  }

  // MARK: Lifecycle

  /// Foreground loop: refresh the selected journey every 30 s and watch usual buses.
  func becameActive() {
    store.reloadFromDisk()
    PhoneSync.shared.send(store.state)
    ticker?.cancel()
    ticker = Task { [weak self] in
      var tick = 0
      while !Task.isCancelled {
        guard let self else { return }
        if tick % 6 == 0, let j = self.selectedJourney { await self.refresh(j) }
        await self.checkUsual()
        if tick % 6 == 3 { await BusActivities.refreshAll(api: self.api) }
        tick += 1
        try? await Task.sleep(for: .seconds(5))
      }
    }
    Task { await stops.loadIfNeeded() }
    Task { await syncReminders(force: true) }
  }

  func resignedActive() {
    ticker?.cancel()
    ticker = nil
    UIApplication.shared.isIdleTimerDisabled = false
    BackgroundRefresh.schedule(for: store.usualBuses)
  }

  func refresh(_ journey: Journey) async {
    guard !loading.contains(journey.id) else { return }
    loading.insert(journey.id)
    defer { loading.remove(journey.id) }
    let board = await Board.load(journey.stops, api: api, limit: 8, before: 3)
    // Keep the old board if the network failed outright.
    if !board.isEmpty || boards[journey.id] == nil { boards[journey.id] = board }
    updateKeepAwake()
  }

  func isLoading(_ j: Journey) -> Bool { loading.contains(j.id) }

  private func updateKeepAwake() {
    guard store.settings.keepAwake, let j = selectedJourney, let next = boards[j.id]?.upcoming(at: .now).first else {
      UIApplication.shared.isIdleTimerDisabled = false
      return
    }
    UIApplication.shared.isIdleTimerDisabled = next.date.timeIntervalSinceNow < Countdown.secondsThreshold
  }

  // MARK: Usual bus approaching

  func checkUsual(now: Date = .now) async {
    let buses = store.usualBuses
    // Live data at most every 30 s (the API scrapes Marprom on misses): for the bus that's
    // due, and for any that should have left in the last 30 min (it may be running late).
    if now.timeIntervalSince(lastUsualFetch) >= 30 {
      lastUsualFetch = now
      var targets = UsualApproach.possiblyLate(buses, now: now).filter { liveCache[$0.1.key] == nil }
      if let (u, occ, _) = UsualApproach.current(buses, now: now, live: liveCache.mapValues(\.date)) { targets.insert((u, occ), at: 0) }
      for (u, occ) in targets.prefix(3) {
        guard let r = try? await api.schedules(for: u.leg, limit: 6, before: 3),
              let s = u.match(in: (r.earlier ?? []) + r.schedules, on: occ.date) else { continue }
        liveCache[occ.key] = s
      }
      // Forget occurrences that are long gone.
      let keep = Set(buses.flatMap { UsualApproach.candidates($0, now: now).map(\.key) })
      liveCache = liveCache.filter { keep.contains($0.key) }
    }
    guard let (u, occ, phase) = UsualApproach.current(buses, now: now, live: liveCache.mapValues(\.date)) else {
      if approaching != nil { approaching = nil }
      return
    }
    let next = Approaching(usual: u, occurrence: occ, phase: phase, live: liveCache[occ.key])
    if next != approaching { approaching = next }

    if phase == .approaching, store.settings.autoLiveActivity, BusActivities.enabled, !autoStarted.contains(occ.key) {
      autoStarted.append(occ.key)
      autoStarted = Array(autoStarted.suffix(40)) // oldest first, so the newest keys survive
      UserDefaults.standard.set(autoStarted, forKey: "autoStarted")
      _ = try? await BusActivities.trackUsual(u, api: api)
    }
  }

  func trackApproaching() async {
    guard let a = approaching else { return }
    _ = try? await BusActivities.trackUsual(a.usual, api: api)
  }

  // MARK: Reminders, widgets, watch

  private func stateChanged(_ state: AppState) {
    WidgetCenter.shared.reloadAllTimelines()
    PhoneSync.shared.send(state)
    Task { await syncReminders(force: true) }
    if let j = state.selectedJourney, boards[j.id] == nil { Task { await refresh(j) } }
  }

  func syncReminders(force: Bool = false) async {
    guard force || Date.now.timeIntervalSince(lastReminderSync) > 300 else { return }
    lastReminderSync = .now
    let live = await Reminders.liveDepartures(for: store.usualBuses, api: api)
    await Reminders.reschedule(store.usualBuses, live: live)
    BackgroundRefresh.schedule(for: store.usualBuses)
  }

  // MARK: Deep links

  func open(_ url: URL) {
    guard url.scheme == "mbus" else { return }
    let parts = url.pathComponents.filter { $0 != "/" }
    switch url.host() {
    case "journey":
      if let id = parts.first, let j = store.journeys.first(where: { $0.id == id }) {
        store.select(j)
        selectedTab = .departures
      }
    case "usual":
      selectedTab = .usual
      if url.pathComponents.contains("track") { Task { await trackApproaching() } }
    case "map": selectedTab = .map
    case "nearby": selectedTab = .nearby
    default: break
    }
  }

  /// Handles a tap on a usual-bus notification (or its Track action).
  func handleNotification(usualId: String, track: Bool) async {
    selectedTab = .departures
    guard let u = store.usualBuses.first(where: { $0.id == usualId }) else { return }
    if let j = store.journeys.first(where: { $0.stops.contains { $0.stopId == u.stopId && $0.route == u.route } }) { store.select(j) }
    if track || store.settings.autoLiveActivity { _ = try? await BusActivities.trackUsual(u, api: api) }
    await checkUsual()
  }
}

enum AppTab: Hashable {
  case departures, map, nearby, usual
}
