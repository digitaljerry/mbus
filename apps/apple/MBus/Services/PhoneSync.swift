import Foundation
import MBusKit
import WatchConnectivity

/// Sends the user's setup to the watch. Application context survives the watch
/// being away: it is delivered the next time they're in reach, and the watch
/// keeps its own copy, so it keeps working over cellular without the phone.
final class PhoneSync: NSObject, WCSessionDelegate, @unchecked Sendable {
  static let shared = PhoneSync()

  /// Changes made on the watch.
  @MainActor var onReceive: ((AppState) -> Void)?
  private var pending: AppState?

  @MainActor func activate(sending state: AppState) {
    guard WCSession.isSupported() else { return }
    pending = state
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  @MainActor func send(_ state: AppState) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else {
      pending = state
      return
    }
    guard session.isPaired, session.isWatchAppInstalled, let data = try? JSONEncoder().encode(state) else { return }
    try? session.updateApplicationContext(["state": data])
  }

  // MARK: WCSessionDelegate

  nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    Task { @MainActor in
      if let p = self.pending {
        self.pending = nil
        self.send(p)
      }
    }
  }

  /// Pairing or watch-app install changed: send the current setup so the watch has it.
  nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
    Task { @MainActor in self.send(SharedStorage.load()) }
  }

  nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
  nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
    receive(context)
  }

  nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    receive(userInfo)
  }

  private nonisolated func receive(_ payload: [String: Any]) {
    guard let data = payload["state"] as? Data, let state = try? JSONDecoder().decode(AppState.self, from: data) else { return }
    Task { @MainActor in self.onReceive?(state) }
  }
}
