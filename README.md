# 🚌 MBus - Magic Bus Board

A cheerful magic board for Maribor bus schedules. Built to show you the next two departures for your most important stops.

## Features

- **Journeys**: one-tap shortcuts such as Home → School or Office → Home. Each journey merges departures from every stop/line you might board.
- **Live countdowns**: minutes to the next bus, with real-time delays when Marprom publishes them.
- **Live map**: bus positions, route lines and your stops (MapLibre + OpenFreeMap tiles, no API key).
- **Auto-refresh**: schedules every 30 s and buses every 10 s while the page is visible; refreshes immediately when you come back to the tab.
- **Mobile first**: Departures/Map switch, bottom-sheet editor, dark mode, installable PWA with home-screen shortcuts (`/?j=<journey-id>`).
- **Stop search**: find stops by name instead of typing IDs.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Data Sources

1. **[brezavta.si](https://brezavta.si)** (`api.beta.brezavta.si`): real-time arrivals, vehicle positions, stop list and route shapes, built from Marprom's GTFS feed.
2. **[Marprom timetables](https://vozniredi.marprom.si/)**: when brezavta has no trips for a stop/line (Marprom's GTFS feed has had gaps in its weekday calendar), `/api/schedules` scrapes the official timetable page instead, and falls back to tomorrow's timetable late at night.

The scraper depends on Marprom's HTML (`<div id="l-ROUTE">` followed by a table of directions and times); recheck it if their site changes.

API routes: `/api/schedules?stop=255&route=G6`, `/api/vehicles?routes=G6,P18`, `/api/stops`, `/api/geometry?trip=MARPROM:…`. In development, `&at=<epoch ms>` on `/api/schedules` simulates another moment (timetable path only).

## Deployment

Ready to deploy to Vercel:

```bash
npm run build
```

## Contributing

New contributors should review the [Repository Guidelines](AGENTS.md) for project structure, tooling, and review expectations before opening a pull request.

## Tech Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS
- Cheerio for web scraping
- Axios for HTTP requests
- MapLibre GL + OpenFreeMap tiles
- lucide-react icons

## Note

This is an unofficial tool created to improve the user experience of checking bus schedules in Maribor. For official information, please visit the official Marprom website.
