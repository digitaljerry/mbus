# Repository Guidelines

## Project Structure & Module Organization
The Next.js app lives under `src/app`; `page.tsx` renders the client UI and `api/schedules/route.ts` handles scraping Marprom data with Axios and Cheerio. Shared layout, styles, and metadata sit beside it (`layout.tsx`, `globals.css`, `favicon.ico`). Static assets belong in `public/`. Repository-level config files (`next.config.ts`, `vercel.json`, `tsconfig.json`, `eslint.config.mjs`) control routing, deployment, TypeScript, and linting.

## Build, Test, and Development Commands
- `npm run dev` starts the local dev server with Turbopack hot reload.
- `npm run build` produces the production bundle; run before deploying.
- `npm run start` serves the output of `next build` for smoke-testing.
- `npm run lint` applies the Next.js + TypeScript ESLint ruleset.

## Coding Style & Naming Conventions
Stick to TypeScript, 2-space indentation, and default Next.js ESLint guidance. Name React components and pages in PascalCase (e.g., `Home`), hooks and helpers in camelCase, and API route directories with lowercase ids. Prefer functional React components and keep client logic in `"use client"` modules. Tailwind utility classes power styling—group related utilities logically and avoid inline style objects.

## Testing Guidelines
There is no dedicated test runner yet; treat linting and manual checks as required gates. Run `npm run lint` before committing, then verify schedules render and refresh correctly in `npm run dev`. For API tweaks, hit `http://localhost:3000/api/schedules?stop=255&route=G6` with a browser or `curl` to confirm scraping and mock fallbacks stay intact. Add unit or integration tests (e.g., Vitest + Testing Library) when introducing complex logic.

## Commit & Pull Request Guidelines
Follow the existing history: short, imperative commit subjects ("Fix schedule parsing"). Keep related changes together and reference issues with `#ID` when applicable. PRs should summarize intent, list functional/test coverage, and include screenshots or screen recordings for UI updates. Call out any scraping-side effects (rate limits, HTML selectors) so reviewers know what to recheck.

## Deployment & Configuration Notes
Vercel deployment settings mirror local behavior; verify `npm run build` succeeds before merging. The schedules API respects a `DEBUG` toggle in `api/schedules/route.ts`—set it deliberately and avoid committing verbose logging in production branches. Document any new environment variables in the README before use.
