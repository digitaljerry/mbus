# MBus for iOS: plan

Status: M0–M2 scaffolded in `apps/apple` (simulator builds), watchOS standalone app included · updated 4 Nov 2026
Related: [accounts plan](accounts-plan.md) · live roadmap on the [About page](https://mbus.vercel.app/about), from `apps/web/src/app/lib/roadmap.ts`

## Web app vs iOS app

The web app (mbus.vercel.app) is live and covers most day-to-day use. The iOS app adds what only works when MBus isn't open: the lock screen, Dynamic Island, widgets, Siri and background triggers.

Legend: ✅ live · 🧪 beta · ⏭ next · 📅 planned (milestone) · 💤 later · — not possible on that platform

| Feature | Web app | iOS app | Notes |
| --- | --- | --- | --- |
| **Departures** | | | |
| Journey board (merged stops/lines) | ✅ | 📅 M0 | |
| Live countdowns, m:ss under 10 min | ✅ | 📅 M0 | iOS: `Text(timerInterval:)` |
| Tap to track one bus | ✅ | 📅 M0 | iOS: can start a Live Activity |
| Real-time delays | ✅ | 📅 M0 | only for trips in Marprom's GTFS feed |
| Timetable fallback (Marprom) | ✅ | 📅 same backend | |
| Arrival time at destination | ✅ | 📅 M0 | exact for live trips, otherwise timetable |
| Auto-refresh while open | ✅ | 📅 M0 | |
| Service alerts | ⏭ | 📅 M3 | brezavta returns `alerts` per arrival |
| **Map & location** | | | |
| Live bus map with route lines | ✅ | 📅 M0 | iOS: MapKit |
| Nearby stops | ✅ | 📅 M3 | |
| Walking directions | ✅ Google Maps link | 📅 M3 Apple Maps | |
| "You're at your stop" suggestions | — | 💤 v2 | region monitoring |
| **Your buses** | | | |
| Journey shortcuts | ✅ chips, `/?j=`, PWA shortcuts | 📅 M4 App Shortcuts | |
| Usual buses + leave-by time | ✅ | 📅 M1 | |
| Reminders | 🧪 Web Push | 📅 M1 local notifications | iPhone web: Home Screen install required |
| Delay-aware reminders | 🧪 | 📅 M5 | web: checked when due; iOS: server push |
| Keep screen awake | ✅ | 📅 M0 | web: Wake Lock API |
| **Glanceable** | | | |
| Live Activities & Dynamic Island | — | 📅 M2, push updates M5 | |
| Home & lock-screen widgets | — | 📅 M2 | |
| Siri & Shortcuts | — | 📅 M4 | App Intents |
| Apple Watch | — | 🧪 W1 | standalone over cellular/Wi‑Fi, complications, usual-bus alerts |
| Usual bus approaching | — | 🧪 M2 | alert + auto Live Activity; push-to-start from server in M5 |
| **Account & sync** | | | |
| Sign in (Apple, passkey, email link) | 📅 A1 | 📅 A1 | see accounts plan |
| Sync journeys, usual buses, reminders | 📅 A2 | 📅 A2 | |
| Export / delete data | 📅 A2 | 📅 A2 | |
| **App** | | | |
| Install | ✅ PWA | 📅 TestFlight M4 | |
| Dark mode | ✅ | 📅 M0 | |
| Works offline (countdowns keep running) | ✅ | 📅 M0 | |
| Slovenian language | 💤 | 💤 | |

Android uses the web app, which installs as a PWA and supports everything in the Web column, including reminders without extra steps.

## Status (4 Nov 2026)

Built in `apps/apple` and checked on iOS 27.3 / watchOS 27.3 simulators against the live API. Not yet run on a device: that needs a signing team.

| Area | State |
| --- | --- |
| Journey board (merged legs, earlier departures, arrival times, live/timetable status, 30 s refresh, keep awake, school-holiday warning) | ✅ simulator |
| Departure sheet: hero countdown, Track, make usual | ✅ simulator |
| Journey and usual-bus editors, stop picker (search by name/sign number, nearest first) | ✅ builds, not tapped through (no simulator input without the Xcode MCP approval) |
| Map: journey stops, live buses (10 s), route shape of a tapped bus | ✅ simulator (no buses were reporting at night) |
| Nearby + Apple Maps walking directions | ✅ simulator |
| Usual bus approaching: board card, tab-bar mini player, auto Live Activity | ✅ simulator (activity started automatically) |
| Reminders (time-sensitive, 7 days, live-adjusted in background refresh) | ✅ builds, unit-tested planner |
| Live Activity + Dynamic Island + Smart Stack layouts | ✅ simulator (debug gallery) |
| Widgets (usual bus, journey), Control Center control, App Intents / Siri | ✅ builds |
| watchOS standalone app, complications, own reminders, iPhone → watch sync | ✅ simulator (live data with no iPhone paired) |
| Push-to-start / server-driven Live Activities, APNs reminders | ⏭ M5 (needs an APNs key and `/api/live-activities`) |
| Accounts & sync | 📅 A1–A2 |

## New requirements (Nov 2026)

1. **The watchOS app works without the iPhone.** It is an independent watch app (`WKRunsIndependentlyOfCompanionApp`) that calls the MBus API itself over Wi‑Fi or cellular. Journeys and usual buses come from the iPhone via WatchConnectivity (`updateApplicationContext`) and are cached on the watch, so they survive the phone being away. The watch schedules its own usual-bus notifications.
2. **The Xcode project uses the JSON project format** (`MBus.xcodeproj/project.xcproj`, Xcode 27), not `project.pbxproj`. Sources live in folders the project references as a whole (`"kind": "folder"`), so adding a file needs no project edit. `xcodebuild -convert-project xcproj` converts a classic project.
3. **The app knows when a usual bus is approaching** and alerts you:
   - *Approaching* = the next occurrence of a usual bus whose leave-by time (departure − walk − lead time) has arrived and which hasn't left yet. The live departure is matched by stop, line and timetabled time (`scheduledTime == usual.time`), so delays move the leave-by time.
   - **Notification:** time-sensitive local notification at the leave-by time, scheduled 7 days ahead (iPhone and watch). `BGAppRefreshTask` re-checks live data before it's due and reschedules it with the delay.
   - **Live Activity:** started automatically when the app is open (or comes to the foreground) inside the window, from the notification's *Track* action, from the *Track my usual bus* control/Shortcut (a `LiveActivityIntent`, which may start an activity from the background), and, in M5, by a server push-to-start.
   - **M5 (server):** the app registers its push-to-start token and usual buses with `/api/live-activities`; the reminder workflow (`apps/web/src/workflows/reminders.ts`) sends an APNs push-to-start at the leave-by time and update pushes as the estimate moves. Needs an APNs `.p8` key.

## Project setup (`apps/apple`)

```
apps/apple/
  MBus.xcodeproj/project.xcproj   JSON project (Xcode 27); four targets, folder references
  MBusKit/                        local Swift package (iOS 26, watchOS 26, macOS 26 for `swift test`)
    Sources/MBusKit               models, API client (mbus.vercel.app/api only), Europe/Ljubljana time,
                                  usual-bus logic, board merging, shared store (App Group), Live Activity attributes
    Sources/MBusUI                SwiftUI pieces shared by app, widgets and watch (line badge, countdowns, colours)
    Tests/MBusKitTests            Swift Testing
  MBus/                           iOS + iPadOS app (SwiftUI, Liquid Glass, TabView sidebar on iPad)
  MBusWidgets/                    WidgetKit extension: widgets, lock screen, Live Activity + Dynamic Island, controls
  MBusWatch/                      watchOS app (single target, standalone)
  MBusWatchWidgets/               watchOS widget extension: complications / Smart Stack
  Config/                         Info.plists and entitlements (kept out of the synced folders)
```

| Target | Product | Bundle ID |
| --- | --- | --- |
| MBus | iOS app (embeds widgets + watch app) | `dev.zorec.mbus` |
| MBusWidgets | iOS widget extension | `dev.zorec.mbus.widgets` |
| MBusWatch | watchOS app | `dev.zorec.mbus.watchkitapp` |
| MBusWatchWidgets | watchOS widget extension | `dev.zorec.mbus.watchkitapp.widgets` |

- Shared App Group `group.dev.zorec.mbus` holds `state.json` (journeys, usual buses, settings) read by the app, widgets and intents. A Codable JSON store replaced SwiftData: the state is small, the same file syncs to the watch, and there's no schema migration to manage.
- Swift 6 language mode, iOS/watchOS 26 minimum (Liquid Glass, latest WidgetKit/ActivityKit/App Intents APIs), built with Xcode 27 beta.
- Signing: personal project, signed only by Jernej's personal Apple Developer account (Individual, paid, needed for TestFlight and the App Store), never the Rally Reader LLC team. Bundle IDs live under `dev.zorec.mbus`. No team is set yet; once enrolled, set `DEVELOPMENT_TEAM` once at the project level.

## What the iOS app adds

### Usual buses + reminders (M1)
Same model as the web app (`apps/web/src/app/lib/usual.ts`): stop, line, timetable time, weekdays, walking time, optional destination, reminder lead time.
- Reminders are `UNUserNotificationCenter` local notifications with `.timeSensitive` interruption level. The next ~7 days are scheduled on device (iOS allows 64 pending), and rescheduled on app open and in `BGAppRefreshTask`.
- Works offline, with no server needed for the basic case.
- Delay-aware reminders (M5) reuse the server scheduler that already powers web reminders (`apps/web/src/workflows/reminders.ts`), sending APNs instead of Web Push.

### Nearby (M3)
When-In-Use location, with the stop list bundled and refreshed weekly from `/api/stops`. It uses the existing `/api/nearby` endpoint. Walking time comes from MapKit walking directions instead of the straight-line estimate the web app uses.

### Live Activities + Dynamic Island (M2, M5)
- Start one from any departure ("Track"), automatically for a usual bus at reminder time, or from Siri.
- Shows the line badge, destination, countdown, stop, and live or delay status.
- The countdown ticks on its own with `Text(timerInterval:countsDown:)`.
- **M2:** updated from the app in the foreground and in background refresh.
- **M5:** server-driven updates. The app registers the activity's push token with `/api/live-activities`. A Vercel Workflow per activity polls live data every ~30 s (sleep-loop) and sends an APNs `liveactivity` push when the estimate moves by ≥ 30 s. It ends 2 minutes after departure.

### Widgets (M2)
- Small: next usual bus. Medium: next 3 for a journey. Lock screen: minutes to the next bus.
- Timeline entries come from the timetable, and `Text(timerInterval:)` keeps them ticking.

### Siri & Shortcuts (M4)
App Intents such as "Next bus home", "Start tracking my bus" and "Nearby buses". These enable automations, e.g. "when I leave the office Wi-Fi, start a Live Activity".

### Later
- Region monitoring around your usual stops (v2), to suggest tracking when you're there at the usual time.
- CarPlay is not relevant for bus riders.

## Architecture

The app lives in [`apps/apple`](../apps/apple) in this repository, next to the web app and API in `apps/web`.

```
iOS app (SwiftUI, iOS 26+) + watchOS app (watchOS 26+, standalone)
 ├─ MBusKit (Swift package; shared by app, widgets, Live Activity, intents)
 │   ├─ API client → mbus.vercel.app/api/*
 │   ├─ Models: Stop, Departure, Vehicle, Journey, UsualBus (mirror apps/web/src/app/types.ts, lib/usual.ts)
 │   ├─ Time: Europe/Ljubljana rules (mirror apps/web/src/app/lib/time.ts)
 │   └─ Store: Codable JSON in an App Group container (shared with extensions, synced to the watch)
 ├─ Widget extension (WidgetKit + ActivityKit UI)
 └─ App Intents

Backend (existing Next.js app on Vercel)
 ├─ /api/schedules?stop&route&to   departures + arrival times   (live)
 ├─ /api/nearby?lat&lon            stops near you + departures  (live)
 ├─ /api/vehicles, /api/stops, /api/geometry                    (live)
 ├─ /api/push/*                    Web Push reminder scheduler  (live, beta)
 ├─ /api/live-activities           register APNs tokens         (M5)
 └─ /api/auth/*, /api/me/*         accounts & sync              (A1/A2)
```

- All scraping and fallback logic stays on the server, so the app never talks to brezavta or Marprom directly. One place to fix when their HTML changes.
- **Always-on work runs on Vercel Workflow** (durable sleeps and hooks), the same way web reminders do today. There's no separate worker and no once-a-minute scheduled job.
- APNs needs a `.p8` key stored as a Vercel environment variable.

## Milestones

| # | Scope | Size |
| --- | --- | --- |
| M0 | Project, MBusKit, API client, board, tracking, map (web parity) | 1–2 weeks |
| M1 | Usual buses, local reminders, leave-by | 1 week |
| M2 | Live Activities (local updates), Dynamic Island, widgets | 1 week |
| M3 | Nearby, walking directions, service alerts | 1 week |
| M4 | App Intents / Siri, App Shortcuts, TestFlight | 3–5 days |
| M5 | Push-updated Live Activities, APNs reminders via Workflow | 1–2 weeks |
| A1–A2 | Accounts and sync (see accounts plan), can run alongside M1–M3 | 1–2 weeks |

Prerequisites: an Apple Developer account ($99/yr), an APNs key (M5), and a privacy policy (location and notifications).

## Risks and open questions
- **Data source:** brezavta's API is a public beta. Ask its maintainers about polling limits before an App Store release. Marprom's GTFS feed has had calendar gaps; the timetable scraper covers them, without real-time data.
- **Real-time coverage:** only trips in the GTFS feed get live delays, bus-to-trip matching and exact arrival times.
- **App Store review:** an unofficial transit app is fine. Avoid Marprom branding.
- **Battery:** no continuous background location. Region monitoring and Live Activities are the battery-friendly options.
- **Open questions:**
  - Public App Store release, or TestFlight for family and friends?
  - Slovenian from day one?
  - Signing: Jernej's personal Apple Developer Program membership (Individual) is to be enrolled. The free Personal Team can't use TestFlight or the App Store.
  - When the iPhone and the watch both schedule a usual-bus reminder, they use the same identifier. Check on real devices that watchOS shows it once; if not, leave reminders to the iPhone while it's reachable.
