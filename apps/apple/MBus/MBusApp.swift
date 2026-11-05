import AppIntents
import MBusKit
import SwiftUI
import UserNotifications

@main
struct MBusApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @State private var model = AppModel()
  @Environment(\.scenePhase) private var scenePhase

  @ViewBuilder private var content: some View {
    #if DEBUG
    if DebugGallery.isEnabled { DebugGallery() } else { RootView() }
    #else
    RootView()
    #endif
  }

  var body: some Scene {
    WindowGroup {
      content
        .environment(model)
        .environment(model.store)
        .environment(model.stops)
        .tint(.accentColor)
        .onOpenURL { model.open($0) }
        .onAppear { delegate.model = model }
    }
    .onChange(of: scenePhase) { _, phase in
      #if DEBUG
      if DebugGallery.isEnabled { return }
      #endif
      switch phase {
      case .active: model.becameActive()
      case .background: model.resignedActive()
      default: break
      }
    }
    .backgroundTask(.appRefresh(BackgroundRefresh.identifier)) {
      await BackgroundRefresh.run()
    }
  }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  weak var model: AppModel? {
    didSet { if let model, let p = pendingResponse { pendingResponse = nil; Task { await model.handleNotification(usualId: p.0, track: p.1) } } }
  }
  /// A notification tapped on a cold launch, before the UI (and model) exists.
  private var pendingResponse: (String, Bool)?

  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    Reminders.registerCategories()
    MBusShortcuts.updateAppShortcutParameters()
    return true
  }

  // Show usual-bus reminders even when MBus is open.
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let info = response.notification.request.content.userInfo
    guard let usualId = info["usualId"] as? String else { return }
    let track = response.actionIdentifier == ReminderPlanner.trackActionId
    guard response.actionIdentifier != UNNotificationDismissActionIdentifier else { return }
    await MainActor.run {
      if let model = self.model {
        _ = Task { await model.handleNotification(usualId: usualId, track: track) }
      } else {
        self.pendingResponse = (usualId, track)
      }
    }
  }
}

/// Siri phrases and Spotlight actions.
struct MBusShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: NextBusIntent(), phrases: [
      "When's the next bus in \(.applicationName)",
      "Next bus on \(\.$journey) in \(.applicationName)",
    ], shortTitle: "Next Bus", systemImageName: "bus")
    AppShortcut(intent: TrackUsualBusIntent(), phrases: [
      "Track my bus in \(.applicationName)",
      "Track \(\.$bus) in \(.applicationName)",
    ], shortTitle: "Track Usual Bus", systemImageName: "dot.radiowaves.left.and.right")
    AppShortcut(intent: StopTrackingIntent(), phrases: ["Stop tracking my bus in \(.applicationName)"],
                shortTitle: "Stop Tracking", systemImageName: "xmark.circle")
  }
}
