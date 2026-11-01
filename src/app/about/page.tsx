import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Bus, Globe, Smartphone } from 'lucide-react';
import { ROADMAP, STATUS_LABEL, type PlatformStatus, type Status } from '../lib/roadmap';

export const metadata: Metadata = {
  title: 'About & roadmap – MBus',
  description: 'What MBus does today on the web, and what is planned for the web and the iOS app.',
};

const STATUS_STYLE: Record<Status, string> = {
  live: 'bg-live/15 text-live',
  beta: 'bg-warn/15 text-warn',
  next: 'bg-accent/12 text-accent',
  planned: 'bg-surface-2 text-ink-2 ring-1 ring-line',
  later: 'bg-surface-2 text-ink-3',
  'not-possible': 'text-ink-3',
};

function StatusPill({ s }: { s: PlatformStatus }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}>
        {s.status === 'not-possible' ? '—' : STATUS_LABEL[s.status]}
      </span>
      {s.note && <span className="text-[0.7rem] leading-tight text-ink-3">{s.note}</span>}
      {s.status === 'not-possible' && !s.note && <span className="text-[0.7rem] leading-tight text-ink-3">Not possible</span>}
    </span>
  );
}

export default function AboutPage() {
  const all = ROADMAP.flatMap(g => g.features);
  const count = (platform: 'web' | 'ios', statuses: Status[]) => all.filter(f => statuses.includes(f[platform].status)).length;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="-ml-2 rounded-full p-2 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Back to departures">
            <ArrowLeft className="size-5" />
          </Link>
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <Bus className="size-4" aria-hidden />
          </span>
          <h1 className="text-lg font-bold tracking-tight">About MBus</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <section className="space-y-3 text-[0.95rem] leading-relaxed text-ink-2">
          <p className="text-lg font-semibold text-ink">Your everyday Maribor buses, without the timetable hunting.</p>
          <p>
            MBus shows when your next bus leaves for the journeys you make every day, follows it live when Marprom
            publishes real-time data, and can remind you when it&apos;s time to leave. It&apos;s an unofficial,
            independent project.
          </p>
        </section>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold"><Globe className="size-4" aria-hidden /> Web app</p>
            <p className="mt-1 text-2xl font-bold tabular">{count('web', ['live', 'beta'])}<span className="text-base font-medium text-ink-3"> live</span></p>
            <p className="text-xs text-ink-3">{count('web', ['next', 'planned', 'later'])} planned · works on any phone or computer</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4" aria-hidden /> iOS app</p>
            <p className="mt-1 text-2xl font-bold tabular">{count('ios', ['next', 'planned'])}<span className="text-base font-medium text-ink-3"> planned</span></p>
            <p className="text-xs text-ink-3">Not started yet · {count('ios', ['later'])} more later</p>
          </div>
        </div>

        <section className="mt-8" aria-labelledby="roadmap-heading">
          <h2 id="roadmap-heading" className="text-base font-semibold">Features &amp; roadmap</h2>
          <p className="mt-1 text-sm text-ink-3">
            Every feature, on every platform. Android uses the web app, which installs like an app and supports
            everything in the Web column, including reminders.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(['live', 'beta', 'next', 'planned', 'later'] as Status[]).map(s => (
              <span key={s} className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[s]}`}>{STATUS_LABEL[s]}</span>
            ))}
            <span className="inline-flex items-center px-1 text-ink-3">— not possible on that platform</span>
          </div>

          <div className="mt-4 space-y-6">
            {ROADMAP.map(group => (
              <div key={group.title}>
                <h3 className="mb-2 text-sm font-semibold text-ink-2">{group.title}</h3>
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card" role="table" aria-label={group.title}>
                  <div role="row" className="hidden border-b border-line px-4 py-2 text-xs font-medium text-ink-3 sm:grid sm:grid-cols-[1fr_9rem_9rem] sm:gap-3">
                    <span role="columnheader">Feature</span>
                    <span role="columnheader">Web</span>
                    <span role="columnheader">iOS app</span>
                  </div>
                  <div className="divide-y divide-line">
                    {group.features.map(f => (
                      <div key={f.name} role="row" className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_9rem_9rem]">
                        <div role="cell" className="col-span-2 sm:col-span-1">
                          <p className="font-medium">{f.name}</p>
                          <p className="mt-0.5 text-xs leading-snug text-ink-3">{f.description}</p>
                        </div>
                        <div role="cell" className="flex items-start gap-2">
                          <span className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-ink-3 sm:hidden">Web</span>
                          <StatusPill s={f.web} />
                        </div>
                        <div role="cell" className="flex items-start gap-2">
                          <span className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-ink-3 sm:hidden">iOS</span>
                          <StatusPill s={f.ios} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-3">
            M0–M5 are iOS milestones and A1–A2 the account milestones; see the{' '}
            <a className="underline hover:text-ink" href="https://github.com/digitaljerry/mbus/blob/main/docs/ios-app-plan.md" target="_blank" rel="noopener noreferrer">iOS plan</a>{' '}
            and{' '}
            <a className="underline hover:text-ink" href="https://github.com/digitaljerry/mbus/blob/main/docs/accounts-plan.md" target="_blank" rel="noopener noreferrer">accounts plan</a>.
          </p>
        </section>

        <section className="mt-10 space-y-3 text-sm leading-relaxed text-ink-2" aria-labelledby="data-heading">
          <h2 id="data-heading" className="text-base font-semibold text-ink">Where the data comes from</h2>
          <p>
            Live arrivals, bus positions and route shapes come from{' '}
            <a className="underline hover:text-ink" href="https://brezavta.si" target="_blank" rel="noopener noreferrer">brezavta.si</a>, built on
            Marprom&apos;s public GTFS feed. When that feed is missing trips, MBus reads{' '}
            <a className="underline hover:text-ink" href="https://vozniredi.marprom.si" target="_blank" rel="noopener noreferrer">Marprom&apos;s official timetable</a>{' '}
            instead; those times are marked &ldquo;Scheduled&rdquo;. Map tiles: OpenFreeMap, © OpenStreetMap contributors.
          </p>
          <p>
            Your journeys and usual buses are stored only in this browser. If you turn on reminders, the reminder
            service on Vercel gets just what it needs to send them: the usual buses you want reminders for and this
            device&apos;s push address. Turning reminders off stops it; its records are removed after Vercel&apos;s
            standard retention period. There are no accounts, ads or tracking.
          </p>
        </section>

        <footer className="mt-10 border-t border-line pt-4 pb-10 text-xs text-ink-3">
          <p>
            Open source on{' '}
            <a className="underline hover:text-ink" href="https://github.com/digitaljerry/mbus" target="_blank" rel="noopener noreferrer">GitHub</a>
            {commit && <> · build {commit}</>}. Not affiliated with Marprom.
          </p>
        </footer>
      </main>
    </div>
  );
}
