'use client';

import { ChevronDown, ExternalLink, FileText, Map as MapIcon, MapPin } from 'lucide-react';
import type { Vehicle } from '../types';
import { linePdf, NETWORK_PDF, type NetworkResponse } from '../lib/network';
import RouteBadge from './RouteBadge';

interface Props {
  network: NetworkResponse | null;
  failed: boolean;
  vehicles: Vehicle[];
  selected: string | null;
  onSelect: (route: string | null) => void;
  onShowMap: () => void;
  onShowStop: (stopId: string) => void;
}

/** "Head - … - Tail" → "Head ↔ Tail" for a compact line summary. */
function ends(headsign: string) {
  const parts = headsign.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
  return parts.length >= 2 ? `${parts[0]} ↔ ${parts[parts.length - 1]}` : headsign;
}

export default function LinesView({ network, failed, vehicles, selected, onSelect, onShowMap, onShowStop }: Props) {
  const live = new Map<string, number>();
  vehicles.forEach(v => live.set(v.route, (live.get(v.route) ?? 0) + 1));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="text-sm text-ink-2">
          Every Marprom line, drawn on the map in its colour, with buses moving live. Tap a line to highlight it and see its stops.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onShowMap} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink lg:hidden">
            <MapIcon className="size-4" aria-hidden /> Show map
          </button>
          <a
            href={NETWORK_PDF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink"
          >
            <FileText className="size-4" aria-hidden /> Marprom network map <span className="text-xs text-ink-3">(PDF, 20 MB)</span>
          </a>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          {vehicles.length > 0 ? `${vehicles.length} buses live right now.` : 'No live bus positions right now.'}
        </p>
      </div>

      {!network && !failed && (
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      )}
      {failed && <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">Couldn&apos;t load the line network. Try again in a moment.</p>}

      {network && (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {network.lines.map(line => {
            const open = selected === line.route;
            const main = line.variants[0];
            const count = live.get(line.route) ?? 0;
            return (
              <li key={line.route} className="border-b border-line last:border-b-0">
                <button
                  onClick={() => onSelect(open ? null : line.route)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 ${open ? 'bg-surface-2' : ''}`}
                >
                  <RouteBadge route={line.route} color={line.color} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ends(main?.headsign ?? '')}</p>
                    <p className="text-xs text-ink-3">
                      {count > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="live-dot" aria-hidden /> {count} live
                        </span>
                      ) : (
                        'No buses live'
                      )}
                    </p>
                  </div>
                  <ChevronDown className={`size-4 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {open && (
                  <div className="space-y-3 px-4 pb-4 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={onShowMap} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-semibold lg:hidden">
                        <MapIcon className="size-3.5" aria-hidden /> Show on map
                      </button>
                      <a
                        href={linePdf(line.route)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-semibold"
                      >
                        <ExternalLink className="size-3.5" aria-hidden /> {line.route} line map (PDF)
                      </a>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Directions</p>
                      <ul className="space-y-0.5 text-sm text-ink-2">
                        {line.variants.map(v => (
                          <li key={v.headsign + v.stops.length}>
                            → {v.headsign} <span className="text-xs text-ink-3">· {v.stops.length} stops</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {main && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Stops towards {main.headsign.split(/\s+-\s+/).at(-1)}</p>
                        <ol className="relative ml-1.5 border-l-2 pl-4" style={{ borderColor: line.color }}>
                          {main.stops.map((id, i) => (
                            <li key={`${id}-${i}`}>
                              <button onClick={() => onShowStop(id)} className="flex w-full items-center gap-2 py-1 text-left text-sm hover:text-ink">
                                <span className="-ml-[1.4rem] size-2.5 shrink-0 rounded-full border-2 bg-surface" style={{ borderColor: line.color }} aria-hidden />
                                <span className="truncate text-ink-2">{network.stops[id]?.[0] ?? `Stop ${id}`}</span>
                                <MapPin className="ml-auto size-3.5 shrink-0 text-ink-3" aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {network && (
        <p className="text-xs text-ink-3">
          Routes from Marprom&apos;s GTFS data via brezavta.si, updated {new Date(network.generatedAt).toLocaleDateString('en-GB')}. Some
          short trips and variants may differ; Marprom&apos;s PDFs are authoritative.
        </p>
      )}
    </div>
  );
}
