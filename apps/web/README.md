# MBus web app

The MBus website and the API (`/api/*`) that all MBus clients use. Next.js App Router, deployed to Vercel from this folder.

## Features

- **Journeys**: one-tap shortcuts such as Home → School or Office → Home. Each journey merges departures from every stop/line you might board.
- **Live countdowns**: minutes to the next bus, m:ss in the last 10 minutes, with real-time delays from Marprom's live system (the same data as the boards at stops). Tap any departure for a full-screen countdown.
- **Arrival times**: set where you get off to see when you arrive.
- **Usual buses**: bookmark the bus you take regularly (days + walking time) to get a leave-by time.
- **Reminders**: Web Push notifications before it's time to leave, adjusted for delays (on iPhone, add MBus to the Home Screen first).
- **Nearby**: stops within walking distance of you and what leaves next on every line.
- **Live map**: bus positions, route lines and your stops (MapLibre + OpenFreeMap tiles, no API key).
- **Auto-refresh & screen wake lock**: refreshes every 30 s while visible, keeps the screen on when your bus is under 10 minutes away.
- **Mobile first**: Departures/Map switch, bottom sheets, dark mode, installable PWA with home-screen shortcuts (`/?j=<journey-id>`).
- **About page** (`/about`): every feature with its status on the web and the planned iOS app.

Plans: [iOS app](../../docs/ios-app-plan.md) · [accounts & sync](../../docs/accounts-plan.md)

## Getting Started

```bash
cd apps/web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Data Sources

1. **Marprom real-time API** (`https://vozniredi.marprom.si/OBA/…`, undocumented, no key): the data behind the arrival boards at stops. `GetArrivalsForStopPoint?stopPointId=` gives the next bus or two per line with timetabled time (`ArrivalTime`), minutes to go (`ETAMin`), fleet number (`BusCode`) and, only while the bus is tracked, `DelayMin`. `GetActiveDeviceDetails` gives bus positions, `GetLines` maps `LineId` to line codes. Errors and "no data" (e.g. at night) come back as HTTP 200 with `Response.Status: -1`. Code in `src/app/lib/oba.ts`; it is laid over whichever list below is used, matched on the timetabled time. Responses are cached 10 s per stop. Marprom's firewall is known to drop traffic from Cloudflare's network; Vercel reaches it.
2. **[brezavta.si](https://brezavta.si)** (`api.beta.brezavta.si`): departure lists with trip IDs (for exact arrival times), the stop list and route shapes, built from Marprom's GTFS feed. Also the fallback for bus positions.
3. **[Marprom timetables](https://vozniredi.marprom.si/)**: when brezavta has no trips for a stop/line (Marprom's GTFS feed at `vozniredi.marprom.si/GTFS/gtfs.zip` often lags the real timetable), `/api/schedules` scrapes the official timetable page instead, and falls back to tomorrow's timetable late at night.

The scraper depends on Marprom's HTML (`<div id="l-ROUTE">` followed by a table of directions and times); recheck it if their site changes.

`source` in `/api/schedules` is `marprom-live` when live data was used, otherwise `brezavta` or `marprom`. Departures and vehicles carry `busCode`, which links a departure to its bus on the map.

API routes: `/api/schedules?stop=255&route=G6&to=326`, `/api/nearby?lat=…&lon=…`, `/api/vehicles?routes=G6,P18`, `/api/stops`, `/api/geometry?trip=MARPROM:…`, `/api/push/{config,sync,test}`. In development, `&at=<epoch ms>` on `/api/schedules` simulates another moment (timetable path only).

## Reminders (Web Push) setup

Reminders run on [Vercel Workflow](https://vercel.com/docs/workflows): one durable workflow per device sleeps until the next reminder is due, checks live data, sends the notification and goes back to sleep. No database and no cron job; it works on any Vercel plan.

Set these environment variables (Project → Settings → Environment Variables), then redeploy:

| Variable | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | public key from `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | matching private key (keep secret) |
| `VAPID_SUBJECT` | `mailto:you@example.com` (contact for push services) |

Without them the app works normally and the reminder switch explains that reminders aren't set up. For local development put the same variables in `.env.local` (git-ignored). `POST /api/dev/push-sink` is a development-only fake push service for testing reminders without a browser.

## Deployment

Pushes to `main` deploy to Vercel (project Root Directory: `apps/web`; commits that don't touch `apps/web` are skipped). Run `npm run build` in `apps/web` first to catch type errors.

## Contributing

New contributors should review the [Repository Guidelines](../../AGENTS.md) for project structure, tooling, and review expectations before opening a pull request.

## Tech Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- Cheerio for web scraping
- Axios for HTTP requests
- MapLibre GL + OpenFreeMap tiles
- lucide-react icons
- Vercel Workflow + web-push for reminders

## Note

This is an unofficial tool created to improve the user experience of checking bus schedules in Maribor. For official information, please visit the official Marprom website.
