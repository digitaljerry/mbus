# 🚌 MBus - Simple Transit

A cleaner, simpler interface for checking Maribor bus schedules. Built to show you the next two departures for your most important bus stops.

## Features

- **Clean Interface**: No clutter, just the next departures you need
- **Three Key Routes**: Pre-configured for your main travel routes
  - Home → City (Stop 255, Route G6)
  - City → Home (Stop 359, Route G6) 
  - Office → Home (Stop 347, Route G6)
- **Real-time Updates**: Refresh to get the latest schedules
- **Mobile Friendly**: Works great on your phone
- **Fun Design**: Bus emojis and modern UI

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Data Source

Schedule data is fetched from the official Marprom website: https://vozniredi.marprom.si/

The app includes fallback mock data to ensure it always shows useful information.

## Deployment

Ready to deploy to Vercel:

```bash
npm run build
```

## Contributing

New contributors should review the [Repository Guidelines](AGENTS.md) for project structure, tooling, and review expectations before opening a pull request.

## Tech Stack

- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Cheerio for web scraping
- Axios for HTTP requests

## Note

This is an unofficial tool created to improve the user experience of checking bus schedules in Maribor. For official information, please visit the official Marprom website.
