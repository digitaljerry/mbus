# MBus for Apple platforms

iPhone, iPad and Apple Watch apps for MBus. Plan and milestones: [docs/ios-app-plan.md](../../docs/ios-app-plan.md).

The apps talk only to the MBus API in `apps/web` (`https://mbus.vercel.app/api`), never to brezavta or Marprom directly, so data fixes ship once, on the server.

## Layout

```
apps/apple/
  MBus.xcodeproj/project.xcproj   Xcode 27 JSON project (no project.pbxproj); targets use folder references
  MBusKit/                        Swift package shared by every target
    Sources/MBusKit               models, API client, Europe/Ljubljana time, usual buses + "approaching",
                                  reminder planner, board merging, App Group store, Live Activity attributes
    Sources/MBusUI                SwiftUI pieces: line badge, countdowns, status pill, Liquid Glass card
    Tests/MBusKitTests            Swift Testing
  MBus/                           iOS/iPadOS app
  Shared/                         compiled into the app AND the widget extension: Live Activity control,
                                  Live Activity layouts, App Intents (Siri, Shortcuts, controls)
  MBusWidgets/                    widgets, Lock Screen, Live Activity + Dynamic Island, Control Center control
  MBusWatch/                      standalone watchOS app
  MBusWatchWidgets/               watch complications / Smart Stack
  Config/                         Info.plists and entitlements
```

A new `.swift` file in one of the target folders is picked up automatically; the project file doesn't list files.

## Build and run

Requires Xcode 27 (beta, 27C5020n or later). iOS and watchOS 26 minimum.

```bash
cd apps/apple
open MBus.xcodeproj                      # or build from the command line:
xcodebuild -project MBus.xcodeproj -scheme MBus -destination 'platform=iOS Simulator,name=iPhone 18 Pro' build
xcodebuild -project MBus.xcodeproj -scheme MBusWatch -destination 'generic/platform=watchOS Simulator' build
cd MBusKit && swift test                 # unit tests (run on macOS)
```

The `MBus` scheme builds and embeds the widget extension and the watch app (with its complications).

### Signing

MBus is a personal project: sign it only with Jernej's personal Apple Developer account, **never the Rally Reader LLC team** (see `AGENTS.md`). TestFlight and the App Store need a paid Apple Developer Program membership (Individual), not the free "Personal Team". The free team can only run 7-day development builds on your own devices.

No team is set yet, so builds run on the simulator only. To run on a device, set `DEVELOPMENT_TEAM` once in the project-level `build-settings` of `project.xcproj` (or in Xcode › Signing & Capabilities), then let Xcode register:

- App IDs `dev.zorec.mbus`, `.widgets`, `.watchkitapp`, `.watchkitapp.widgets`
- App Group `group.dev.zorec.mbus` (all four targets)
- Time Sensitive Notifications (app and watch app)

### Debug launch arguments (Debug builds only)

| Argument | Effect |
| --- | --- |
| `-MBusURL mbus://map` | open a deep link at launch (`mbus://journey/<id>`, `mbus://usual`, `mbus://usual/track`, `mbus://nearby`, `mbus://map`) |
| `-MBusGallery` | show the Live Activity layouts in the app (simulator screenshots) |
| `-MBusJourney <id>` (watch) | open a journey's board straight away |

To try the "usual bus approaching" flow, add a usual bus whose leave-by time is within the next few minutes. The board shows a *Time to leave* card, the tab bar gets a mini player (iOS 26.1+), a time-sensitive notification fires, and a Live Activity starts.

## How "usual bus approaching" works

1. `UsualApproach` (MBusKit) computes the next occurrence of each usual bus and its phase: *later*, *soon* (15 min before the reminder), *approaching* (reminder time reached, bus not gone), *departed*.
2. The live departure is matched by stop, line and timetabled time (`UsualBus.match`), so a late bus moves the leave-by time.
3. On iPhone:
   - **Reminders:** time-sensitive local notifications for the next 7 days (`Reminders`), rescheduled with live delays on app open and in `BGAppRefreshTask`.
   - **Live Activity:** starts automatically when the app is open in the window, from the notification's *Track* action, from the *Track Usual Bus* control, widget button or Siri (`TrackUsualBusIntent`, a `LiveActivityIntent`), and via server push-to-start once M5 lands.
4. On Apple Watch: the watch schedules the same reminders itself (same identifiers) and fetches live times over Wi‑Fi or cellular, so it works with the iPhone away. iPhone Live Activities also appear in the watch's Smart Stack.
