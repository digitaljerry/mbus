# MBus for iOS: plan

Status: plan, not started · updated Nov 2026
Related: [accounts plan](accounts-plan.md) · live roadmap on the [About page](https://mbus.vercel.app/about), from `src/app/lib/roadmap.ts`

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
| Apple Watch | — | 💤 | complication + glance |
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

## What the iOS app adds

### Usual buses + reminders (M1)
Same model as the web app (`src/app/lib/usual.ts`): stop, line, timetable time, weekdays, walking time, optional destination, reminder lead time.
- Reminders are `UNUserNotificationCenter` local notifications with `.timeSensitive` interruption level. The next ~7 days are scheduled on device (iOS allows 64 pending), and rescheduled on app open and in `BGAppRefreshTask`.
- Works offline, with no server needed for the basic case.
- Delay-aware reminders (M5) reuse the server scheduler that already powers web reminders (`src/workflows/reminders.ts`), sending APNs instead of Web Push.

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
- Apple Watch complication.
- Region monitoring around your usual stops (v2), to suggest tracking when you're there at the usual time.
- CarPlay is not relevant for bus riders.

## Architecture

```
iOS app (SwiftUI, iOS 17+)
 ├─ MBusKit (Swift package; shared by app, widgets, Live Activity, intents)
 │   ├─ API client → mbus.vercel.app/api/*
 │   ├─ Models: Stop, Departure, Vehicle, Journey, UsualBus (mirror src/app/types.ts, lib/usual.ts)
 │   ├─ Time: Europe/Ljubljana rules (mirror src/app/lib/time.ts)
 │   └─ Store: SwiftData in an App Group container (shared with extensions)
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
