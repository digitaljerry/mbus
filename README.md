# MBus

Live departures, reminders and maps for everyday bus journeys in Maribor. Unofficial.

Live at **[mbus.vercel.app](https://mbus.vercel.app)** · features and roadmap on the [About page](https://mbus.vercel.app/about).

## Repository layout

| Path | What | Status |
| --- | --- | --- |
| [`apps/web`](apps/web) | Next.js web app **and the API** every client uses (`/api/*`), deployed to Vercel | Live |
| [`apps/apple`](apps/apple) | iOS + watchOS app, widgets, Live Activities (Xcode, SwiftUI) | Planned |
| [`apps/android`](apps/android) | Android app | Later |
| [`docs`](docs) | Plans: [iOS app](docs/ios-app-plan.md), [accounts & sync](docs/accounts-plan.md) | |

One repository so the API and the apps that use it change together. Each app builds on its own:
Vercel only deploys when `apps/web` changes, and native CI will only build its own folder.

## Getting started (web)

```bash
cd apps/web
npm install
npm run dev
```

See [`apps/web/README.md`](apps/web/README.md) for data sources, reminder (Web Push) setup and API routes,
and [`AGENTS.md`](AGENTS.md) for contribution guidelines.
