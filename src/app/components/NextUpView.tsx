'use client';

import type { ReactNode } from 'react';
import { ChevronDown, Moon, Star } from 'lucide-react';
import type { BusStop, ScheduleResponse } from '../types';
import type { UsualBus } from '../lib/usual';
import { countdown, dayLabel } from '../lib/format';
import { formatClock } from '../lib/time';
import { splitJourneyName } from '../lib/defaults';
import RouteBadge from './RouteBadge';
import UsualSection, { SOON_WINDOW_MS, usualDeparture } from './UsualSection';
import { JUST_DUE_MS, mergeEarlier, type Departure } from './JourneyCard';

interface Props {
  journeys: BusStop[];
  departuresByJourney: Map<string, Departure[]>;
  loadingJourney: (j: BusStop) => boolean;
  usual: UsualBus[];
  data: Record<string, ScheduleResponse>;
  now: number;
  expanded: Set<string>;
  onToggle: (journeyId: string) => void;
  /** The full journey card, shown when a row is expanded. */
  renderCard: (j: BusStop) => ReactNode;
  onOpenUsual: (u: UsualBus, d: Departure) => void;
  onEditUsual: (u: UsualBus) => void;
  onShowUsualTab: () => void;
}

/** "Next up": what you need right now, at a glance. */
export default function NextUpView({
  journeys,
  departuresByJourney,
  loadingJourney,
  usual,
  data,
  now,
  expanded,
  onToggle,
  renderCard,
  onOpenUsual,
  onEditUsual,
  onShowUsualTab,
}: Props) {
  const withNext = usual.map(u => ({ u, d: now ? usualDeparture(u, data, now) : null }));
  const soon = withNext.filter(x => x.d && x.d.schedule.epoch - now <= SOON_WINDOW_MS).map(x => x.u);
  const later = withNext
    .filter(x => x.d && x.d.schedule.epoch - now > SOON_WINDOW_MS)
    .sort((a, b) => a.d!.schedule.epoch - b.d!.schedule.epoch)[0];

  return (
    <div className="space-y-5">
      {soon.length > 0 ? (
        <UsualSection usual={soon} data={data} now={now} onOpen={onOpenUsual} onEdit={onEditUsual} title="Leaving soon" />
      ) : (
        later?.d && (
          <button
            onClick={onShowUsualTab}
            className="flex w-full items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm shadow-card hover:bg-surface-2"
          >
            <Star className="size-4 shrink-0 fill-current text-warn" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-2">
              Next usual bus: <span className="font-medium text-ink">{later.u.label || `${later.u.route} ${later.u.time}`}</span>
              <span className="tabular">
                {' · '}
                {dayLabel(later.d.schedule.epoch, now) ? `${dayLabel(later.d.schedule.epoch, now)} ` : ''}
                leave by {formatClock(later.d.schedule.epoch - later.u.walkMinutes * 60_000)}
              </span>
            </span>
          </button>
        )
      )}

      <section aria-labelledby="journeys-heading">
        <h2 id="journeys-heading" className="mb-2 text-sm font-semibold text-ink-2">
          Your journeys
        </h2>
        <div className="space-y-3">
          {journeys.map(j => {
            const open = expanded.has(j.id);
            if (open) {
              return (
                <div key={j.id} className="relative">
                  {renderCard(j)}
                  <button
                    onClick={() => onToggle(j.id)}
                    className="mx-auto mt-1 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-ink"
                    aria-expanded="true"
                  >
                    <ChevronDown className="size-4 rotate-180" aria-hidden /> Collapse
                  </button>
                </div>
              );
            }
            return (
              <GlanceRow
                key={j.id}
                journey={j}
                justDue={now ? mergeEarlier(j, data, now).filter(d => !d.schedule.realtime && now - d.schedule.epoch < JUST_DUE_MS).at(-1) : undefined}
                departures={departuresByJourney.get(j.id) ?? []}
                loading={loadingJourney(j)}
                now={now}
                onToggle={() => onToggle(j.id)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function GlanceRow({
  journey,
  justDue,
  departures,
  loading,
  now,
  onToggle,
}: {
  journey: BusStop;
  justDue?: Departure;
  departures: Departure[];
  loading: boolean;
  now: number;
  onToggle: () => void;
}) {
  const { from, to } = splitJourneyName(journey.name);
  const [next, then] = departures;
  const c = next ? countdown(next.schedule.epoch, now) : null;
  const day = next && now ? dayLabel(next.schedule.epoch, now) : undefined;

  return (
    <button
      onClick={onToggle}
      aria-expanded="false"
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.95rem] font-semibold">
          {from}
          {to && (
            <>
              <span className="mx-1 text-ink-3">→</span>
              {to}
            </>
          )}
        </p>
        {next ? (
          <>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-2 tabular">
              <RouteBadge route={next.route} color={next.color} size="sm" />
              <span className="truncate">
                {day ? `${day} ` : ''}
                {next.schedule.time}
                {next.schedule.realtime && <span className="ml-1 text-live">live</span>}
                {next.schedule.arrivalTime && <> · arrives {next.schedule.arrivalTime}</>}
              </span>
            </p>
            {justDue && (
              <p className="mt-0.5 truncate text-xs text-warn tabular">
                {justDue.route} {justDue.schedule.time} was due {Math.max(0, Math.floor((now - justDue.schedule.epoch) / 60_000))} min ago, may still be coming
              </p>
            )}
            {then && (
              <p className="mt-0.5 truncate text-xs text-ink-3 tabular">
                then {then.route !== next.route ? `${then.route} ` : ''}
                {then.schedule.time}
                {now > 0 && then.schedule.epoch - now < 60 * 60_000 && ` (in ${Math.max(0, Math.floor((then.schedule.epoch - now) / 60_000))} min)`}
              </p>
            )}
          </>
        ) : loading ? (
          <div className="mt-1.5 h-4 w-32 animate-pulse rounded bg-surface-2" />
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
            <Moon className="size-3.5" aria-hidden /> No buses soon
          </p>
        )}
      </div>
      {c && (
        <div className="shrink-0 text-right">
          <span className={`block text-3xl font-bold leading-none tracking-tight tabular ${c.urgent ? 'text-accent' : ''}`}>{now ? c.value : '—'}</span>
          {c.unit && <span className="text-xs font-medium text-ink-3">{c.unit}</span>}
        </div>
      )}
      <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden />
    </button>
  );
}
