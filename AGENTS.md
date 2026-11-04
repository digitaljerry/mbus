# Repository Guidelines

## Project Structure & Module Organization
This is a monorepo. Each app lives under `apps/` and builds on its own:
- `apps/web`: the Next.js website **and the API every client uses**. UI under `apps/web/src/app` (`page.tsx`, `components/`, `hooks/`); API routes under `apps/web/src/app/api/*`; shared server/client logic in `apps/web/src/app/lib` (`departures.ts` fetches brezavta and scrapes Marprom with Axios + Cheerio, `time.ts` holds the Europe/Ljubljana rules, `usual.ts`, `holidays.ts`, `roadmap.ts`); reminder scheduling in `apps/web/src/workflows` (Vercel Workflow). Static assets in `apps/web/public/`. Config (`next.config.ts`, `vercel.json`, `tsconfig.json`, `eslint.config.mjs`) sits in `apps/web`.
- `apps/apple`: iOS/watchOS app (planned), `apps/android`: Android app (later).
- `docs/`: plans and roadmap notes, shared by all apps.

Native apps must call only the MBus API in `apps/web`, never brezavta or Marprom directly, so data fixes ship once on the server. When an API response changes, update the clients in the same change.

## Build, Test, and Development Commands
Run web commands from `apps/web`:
- `npm run dev` starts the local dev server with Turbopack hot reload.
- `npm run build` produces the production bundle; run before pushing.
- `npm run start` serves the output of `next build` for smoke-testing.
- `npm run lint` is currently broken (`next lint` was removed in Next 16); use `npx tsc --noEmit` until ESLint is wired up directly.

## Coding Style & Naming Conventions
TypeScript, 2-space indentation, default Next.js ESLint guidance. React components and pages in PascalCase (e.g., `Home`), hooks and helpers in camelCase, API route directories in lowercase. Functional components, client logic in `"use client"` modules. Tailwind utility classes for styling; inline styles only for data-driven values such as line colours.

## Testing Guidelines
No test runner yet; type checks and manual checks are the gates. Verify schedules render and refresh in `npm run dev`. For API changes, hit `http://localhost:3000/api/schedules?stop=255&route=G6&to=326&before=2` and confirm live data, the Marprom fallback and arrival times. In development, `&at=<epoch ms>` simulates another time (timetable data only). Add unit tests (e.g. Vitest) when introducing complex logic.

## Commit & Pull Request Guidelines
Short, imperative commit subjects ("Fix schedule parsing"). Keep related changes together and reference issues with `#ID` when applicable. PRs summarize intent, list functional/test coverage, and include screenshots for UI changes. Call out scraping-side effects (rate limits, HTML selectors) so reviewers know what to recheck.

## Deployment & Configuration Notes
Vercel project Root Directory is `apps/web`. Commits that don't change `apps/web` are skipped by the `ignoreCommand` in `apps/web/vercel.json` (Vercel's own "skip unaffected projects" only works with package-manager workspaces). Production deploys from `main`. Debug logging in `apps/web/src/app/lib/departures.ts` is off unless `DEBUG=1` in development; don't commit verbose logging. Document new environment variables in `apps/web/README.md` before use.
