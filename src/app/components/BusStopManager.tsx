'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { BusStop, StopRoute } from '../types';
import { DEFAULT_STOPS } from '../lib/defaults';
import { routeColor } from '../lib/routeColors';
import RouteBadge from './RouteBadge';

interface StopListItem {
  id: string;
  name: string;
}

interface Props {
  isOpen: boolean;
  journeys: BusStop[];
  onClose: () => void;
  onChange: (journeys: BusStop[]) => void;
}

const KNOWN_ROUTES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'P7', 'P8', 'P10', 'P11', 'P12', 'P15', 'P16', 'P18'];

let stopListPromise: Promise<StopListItem[]> | null = null;
function loadStopList() {
  stopListPromise ??= fetch('/api/stops')
    .then(r => r.json())
    .then(b => (Array.isArray(b.stops) ? b.stops : []))
    .catch(() => {
      stopListPromise = null;
      return [];
    });
  return stopListPromise;
}

type Draft = { id?: string; name: string; description: string; stops: StopRoute[] };
const emptyDraft = (): Draft => ({ name: '', description: '', stops: [{ stopId: '', route: '' }] });

export default function BusStopManager({ isOpen, journeys, onClose, onChange }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stopList, setStopList] = useState<StopListItem[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      return;
    }
    loadStopList().then(setStopList);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const stopName = useMemo(() => new Map(stopList.map(s => [s.id, s.name])), [stopList]);

  if (!isOpen) return null;

  const move = (index: number, delta: number) => {
    const next = [...journeys];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  const save = () => {
    if (!draft) return;
    const stops = draft.stops
      .map(s => ({ stopId: s.stopId.trim(), route: s.route.trim().toUpperCase() }))
      .filter(s => s.stopId && s.route);
    if (!draft.name.trim() || stops.length === 0) return;
    const journey: BusStop = {
      id: draft.id ?? `journey-${Date.now()}`,
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      stops,
    };
    onChange(draft.id ? journeys.map(j => (j.id === draft.id ? journey : j)) : [...journeys, journey]);
    setDraft(null);
  };

  const canSave = Boolean(draft?.name.trim() && draft.stops.some(s => s.stopId.trim() && s.route.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-title"
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl outline-none sm:max-w-xl sm:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="manager-title" className="text-lg font-semibold">
            {draft ? (draft.id ? 'Edit journey' : 'New journey') : 'Your journeys'}
          </h2>
          <button onClick={draft ? () => setDraft(null) : onClose} className="rounded-full p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {draft ? (
            <div className="space-y-5">
              <Field label="Name" hint="Emoji welcome, e.g. 🏠 Home → 🏫 School">
                <input
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="🏠 Home → 🏫 School"
                  className="input"
                  autoFocus
                />
              </Field>
              <Field label="Note" hint="Optional, shown under the name">
                <input
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Pohorska – pošta"
                  className="input"
                />
              </Field>

              <div>
                <p className="mb-1 text-sm font-medium">Where you board</p>
                <p className="mb-3 text-xs text-ink-3">Add every stop + line you might take. Departures are merged, soonest first.</p>
                <div className="space-y-3">
                  {draft.stops.map((leg, i) => (
                    <LegEditor
                      key={i}
                      leg={leg}
                      stopList={stopList}
                      stopName={stopName.get(leg.stopId)}
                      canRemove={draft.stops.length > 1}
                      onChange={next => setDraft({ ...draft, stops: draft.stops.map((s, j) => (j === i ? next : s)) })}
                      onRemove={() => setDraft({ ...draft, stops: draft.stops.filter((_, j) => j !== i) })}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setDraft({ ...draft, stops: [...draft.stops, { stopId: '', route: '' }] })}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-accent hover:bg-surface-2"
                >
                  <Plus className="size-4" /> Add another stop or line
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setDraft(null)} className="flex-1 rounded-xl bg-surface-2 px-4 py-3 font-medium">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!canSave}
                  className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink disabled:opacity-40"
                >
                  Save journey
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {journeys.map((j, i) => (
                  <li key={j.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{j.name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {j.stops.map((s, k) => (
                          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                            <RouteBadge route={s.route} color={routeColor(s.route)} size="sm" />
                            {stopName.get(s.stopId) ?? `Stop ${s.stopId}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton label="Move down" disabled={i === journeys.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Edit"
                        onClick={() => setDraft({ id: j.id, name: j.name, description: j.description ?? '', stops: j.stops.map(s => ({ ...s })) })}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        onClick={() => confirm(`Remove “${j.name}”?`) && onChange(journeys.filter(x => x.id !== j.id))}
                      >
                        <Trash2 className="size-4 text-late" />
                      </IconButton>
                    </div>
                  </li>
                ))}
                {journeys.length === 0 && <li className="rounded-2xl bg-surface-2 p-6 text-center text-sm text-ink-3">No journeys yet.</li>}
              </ul>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => setDraft(emptyDraft())}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink"
                >
                  <Plus className="size-5" /> New journey
                </button>
                <button
                  onClick={() => confirm('Replace your journeys with the default set?') && onChange(DEFAULT_STOPS)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm font-medium text-ink-2"
                >
                  <RotateCcw className="size-4" /> Reset to defaults
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-xs text-ink-3">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function IconButton({ label, children, ...rest }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button aria-label={label} title={label} className="rounded-lg p-2.5 text-ink-2 hover:bg-surface-2 disabled:opacity-25" {...rest}>
      {children}
    </button>
  );
}

function LegEditor({
  leg,
  stopList,
  stopName,
  canRemove,
  onChange,
  onRemove,
}: {
  leg: StopRoute;
  stopList: StopListItem[];
  stopName?: string;
  canRemove: boolean;
  onChange: (leg: StopRoute) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!q) return [];
    return stopList
      .filter(s => s.id === q || s.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
      .slice(0, 8);
  }, [query, stopList]);

  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="text-xs font-medium text-ink-3">Stop</span>
          {leg.stopId && !open ? (
            <button onClick={() => { setOpen(true); setQuery(''); }} className="input mt-1 flex w-full items-center justify-between text-left">
              <span className="truncate">{stopName ?? 'Stop'} <span className="text-ink-3">#{leg.stopId}</span></span>
              <Pencil className="size-3.5 shrink-0 text-ink-3" />
            </button>
          ) : (
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Search stop name or number"
                className="input pl-9"
                inputMode="search"
              />
              {open && matches.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-card">
                  {matches.map(s => (
                    <li key={s.id}>
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { onChange({ ...leg, stopId: s.id }); setOpen(false); setQuery(''); }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2"
                      >
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 text-xs text-ink-3">#{s.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {canRemove && (
          <button onClick={onRemove} aria-label="Remove this stop" className="mt-5 rounded-lg p-2.5 text-ink-3 hover:bg-surface-2">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-3">
        <span className="text-xs font-medium text-ink-3">Line</span>
        <div className="no-scrollbar -mx-1 mt-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {KNOWN_ROUTES.map(r => {
            const active = leg.route.toUpperCase() === r;
            return (
              <button
                key={r}
                onClick={() => onChange({ ...leg, route: r })}
                aria-pressed={active}
                className={`shrink-0 rounded-lg p-0.5 ring-2 ${active ? 'ring-ink' : 'ring-transparent opacity-60 hover:opacity-100'}`}
              >
                <RouteBadge route={r} color={routeColor(r)} size="md" />
              </button>
            );
          })}
          <input
            value={KNOWN_ROUTES.includes(leg.route.toUpperCase()) ? '' : leg.route}
            onChange={e => onChange({ ...leg, route: e.target.value.toUpperCase() })}
            placeholder="Other"
            aria-label="Other line"
            className="input h-8 w-20 shrink-0 py-0 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
