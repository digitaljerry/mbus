# MBus for iOS: draft plan

Status: draft for discussion · Nov 2026

## Why native

The web app (mbus.vercel.app) covers the board, live map, countdowns and keeping the screen on. What a web app can't do on iPhone:

| Want | Web (home-screen PWA) | Native iOS |
| --- | --- | --- |
| Live Activity / Dynamic Island countdown | ❌ | ✅ ActivityKit |
| Lock-screen and home-screen widgets | ❌ | ✅ WidgetKit |
| Reminders ("leave in 5 min") | ⚠️ Web Push only after "Add to Home Screen", needs a push server, no scheduling offline | ✅ Local notifications, scheduled on the device, work offline |
| Location: nearby stops | ✅ while open | ✅ plus "near my stop" region triggers |
| Siri / Shortcuts ("next bus home?") | ❌ | ✅ App Intents |
| Background refresh | ❌ | ⚠️ Limited (BGAppRefresh, push) |

So: keep the web app as the quick, shareable version, and build a native app for anything that has to happen when the app isn't open.

## Core features

### 1. Usual buses (bookmarks)
A **usual bus** is a saved trip habit, not a one-off departure:
- stop + line (+ direction), a time window (e.g. 07:30–08:00), weekdays (Mon–Fri)
- walking time to the stop (entered by hand, or measured from Home with MapKit walking directions)
- optional destination stop, so the app can show the arrival time

You bookmark it from any departure ("Make this my usual bus"). The app then always knows "the next instance of my usual bus" and builds on it:
- **Leave-by time** = departure − walking time − buffer
- **Reminder** at leave-by minus N minutes (default 5)
- **Live Activity** that starts automatically N minutes before leave-by (optional)

### 2. Reminders
- Use `UNUserNotificationCenter` with `.timeSensitive` interruption level, so they get through Focus modes when allowed.
- Schedule the next ~7 days of usual-bus reminders from the timetable. Reschedule on app open and in a `BGAppRefreshTask`.
- iOS caps an app at 64 pending notifications, which is plenty for a week of habits.
- Delay-aware reminders ("your bus is 4 min late, leave at 07:38") need server push. That's v2.

### 3. Nearby (location)
- Request **When In Use** location. The stop list (~460 Marprom stops) is bundled in the app and refreshed weekly from `/api/stops`.
- Nearby screen: stops within 600 m sorted by walking distance, each with its next departures per line and direction, plus "Walk 4 min".
- Map centered on you, with live buses (same data as the web map).
- v2: region monitoring around Home, School and Office stops. When you're at your usual stop at the usual time, offer to start the Live Activity.

### 4. Live Activities + Dynamic Island
- Start one from any departure ("Track"), automatically for a usual bus, or from Siri.
- Content: line badge, destination, countdown, stop name, delay or live status.
- **The countdown runs on its own**: `Text(timerInterval:countsDown:)` ticks every second with no updates needed, giving mm:ss under 10 minutes for free.
- Updates are only needed when the estimate changes (delay):
  - **MVP**: update from the app while it's in the foreground or during background refresh. The countdown is correct for timetable trips, which is today's weekday case anyway.
  - **v2**: server-driven updates via ActivityKit push tokens. A small worker polls brezavta every ~30 s for trips with an active Live Activity and sends an APNs `liveactivity` push when the estimate moves by ≥ 30 s.
- End the activity 2 minutes after departure, or when the bus is detected past the stop.

### 5. Widgets
- Small: next usual bus countdown. Medium: next 3 for a journey. Lock-screen circular: minutes to next bus.
- Timeline entries from the timetable; `Text(timerInterval:)` keeps them ticking.

### 6. Siri and Shortcuts (App Intents)
- "Next bus home", "Start tracking my bus", "Nearby buses".
- These make Shortcuts automations possible, e.g. "When I leave the office Wi-Fi, start a Live Activity for Office → Home".

## Architecture

```
iOS app (SwiftUI, iOS 17+)
 ├─ MBusKit (Swift package, shared by app, widgets, Live Activity, intents)
 │   ├─ API client → mbus.vercel.app/api/*
 │   ├─ Models: Stop, Departure, Vehicle, Journey, UsualBus
 │   ├─ Time: Europe/Ljubljana helpers (same rules as src/app/lib/time.ts)
 │   └─ Store: SwiftData; App Group container shared with extensions
 ├─ Widget extension (WidgetKit + ActivityKit UI)
 └─ App Intents

Backend: the existing Next.js API on Vercel, used as the app's backend
 ├─ /api/schedules, /api/vehicles, /api/stops, /api/geometry   (exist)
 ├─ /api/nearby?lat=&lon=            (new: stops + next departures)
 ├─ /api/stops/{id}/lines            (new: lines + directions per stop, from Marprom page)
 └─ v2: /api/live-activities         (register push token + trip; worker sends APNs)
```

Notes:
- Keep all scraping and fallback logic on the server, so the app never talks to brezavta or Marprom directly. One place to fix when their HTML changes.
- **Push worker (v2)**: Vercel cron is too coarse for 30 s polling. Use a small always-on worker (Fly.io, Railway, or a Supabase scheduled function) with a table of active activities: push token, trip, stop, last sent ETA.
- Sync between devices is not needed for v1. Optionally use iCloud (CloudKit) for usual buses later.
- Map: MapKit for native look, with live buses as annotations, colored by line.

## Milestones (rough)

| # | Scope | Size |
| --- | --- | --- |
| M0 | Project setup, MBusKit, API client, journeys board (parity with web), map | 1–2 weeks |
| M1 | Usual buses + local reminders + leave-by with walking time | 1 week |
| M2 | Live Activities (local updates) + Dynamic Island + widgets | 1 week |
| M3 | Nearby with location, `/api/nearby`, `/api/stops/{id}/lines` | 1 week |
| M4 | App Intents / Siri; TestFlight beta | 3–5 days |
| M5 (v2) | Push-updated Live Activities and delay-aware reminders (worker + APNs) | 1–2 weeks |

Prerequisites: an Apple Developer account ($99/yr), an APNs key (for v2), and a privacy policy (location use).

## Risks and open questions
- **Data source**: brezavta's API is a public beta with no SLA. Ask its maintainers about usage and rate limits before shipping an app that polls it. Marprom's GTFS feed has had gaps (weekday calendar missing); the Marprom timetable scraper covers them but has no real-time data.
- **Real-time coverage**: only trips present in the GTFS feed get live delays and bus-to-trip matching. On days served by the scraper, Live Activities will show timetable time only.
- **App Store review**: an unofficial transit app is fine, but avoid Marprom branding and logos.
- **Battery**: no continuous background location. Region monitoring and Live Activities are the battery-friendly options.
- **Open questions**: TestFlight only for you and your family, or a public App Store release? Slovenian localisation from day one?

## Could ship on the web first

These don't need native code and would also feed the iOS app:
1. Usual buses (bookmarks) with a "Usual" section on the board, stored in localStorage.
2. Nearby stops via the browser Geolocation API plus `/api/nearby`.
3. Arrival time at the destination stop for a journey (match trip IDs, or follow the timetable order).
4. Service alerts: brezavta returns `alerts` per arrival; show them on the card.
5. Web Push reminders for home-screen installs (needs the same push worker as M5).
