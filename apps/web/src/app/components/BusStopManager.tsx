'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Map as MapIcon, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import type { BusStop, StopRoute } from '../types';
import { DEFAULT_STOPS } from '../lib/defaults';
import { routeColor } from '../lib/routeColors';
import RouteBadge from './RouteBadge';
import StopMapPicker from './StopMapPicker';

export interface StopListItem {
  id: string;
  /** ID printed on the stop's timetable sign. */
  code?: string | null;
  name: string;
  lat?: number;
  lon?: number;
}

interface Props {
  isOpen: boolean;
  journeys: BusStop[];
  onClose: () => void;
  onChange: (journeys: BusStop[]) => void;
}

const KNOWN_ROUTES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'P7', 'P8', 'P10', 'P11', 'P12', 'P15', 'P16', 'P18'];

let stopListPromise: Promise<StopListItem[]> | null = null;
export function loadStopList() {
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
  // The parent passes a new onClose on every render (it re-renders every
  // second). Keep it in a ref so the effect below runs only when the dialog
  // opens; re-running it would focus the dialog and steal focus from inputs.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setDraft(null);
      return;
    }
    loadStopList().then(setStopList);
    const onKey = (e: KeyboardEvent) => {
      // Escape inside an open search list closes the list, not the dialog.
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

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
      .map(s => ({ stopId: s.stopId.trim(), route: s.route.trim().toUpperCase(), ...(s.toStopId ? { toStopId: s.toStopId } : {}) }))
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
                      stopName={id => stopName.get(id)}
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
                            {s.toStopId && <> → {stopName.get(s.toStopId) ?? `#${s.toStopId}`}</>}
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
  stopName: (id: string) => string | undefined;
  canRemove: boolean;
  onChange: (leg: StopRoute) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <StopPicker
            label="Get on at"
            value={leg.stopId}
            name={stopName(leg.stopId)}
            stopList={stopList}
            onChange={stopId => onChange({ ...leg, stopId })}
          />
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
      <div className="mt-3">
        <StopPicker
          label="Get off at (optional, for arrival times)"
          value={leg.toStopId ?? ''}
          name={leg.toStopId ? stopName(leg.toStopId) : undefined}
          stopList={stopList}
          onChange={toStopId => onChange({ ...leg, toStopId: toStopId || undefined })}
          clearable
        />
      </div>
    </div>
  );
}

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const WORD_SPLIT = /[\s,.;:/()\-\u2013\u2014]+/;

/**
 * Stops matching a query, best first. Every word of the query has to match:
 * numbers match the ID on the stop's sign (exactly or as a prefix) or a
 * number in the name, words match the start of a word in the name (or
 * anywhere in it). So "255", "glavni trg", "trg 25" and "po\u0161ta" all work.
 */
export function searchStops(list: StopListItem[], query: string, limit = 12): StopListItem[] {
  const tokens = normalize(query).split(WORD_SPLIT).filter(Boolean);
  if (!tokens.length) return [];
  const scored: { s: StopListItem; score: number }[] = [];
  for (const s of list) {
    const name = normalize(s.name);
    const words = name.split(WORD_SPLIT);
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (/^\d+$/.test(t)) {
        if (s.code === t) score += 100;
        else if (s.code?.startsWith(t)) score += 40;
        else if (words.includes(t)) score += 20;
        else ok = false;
      } else if (name.startsWith(t)) score += 30;
      else if (words.some(w => w.startsWith(t))) score += 20;
      else if (name.includes(t)) score += 5;
      else ok = false;
      if (!ok) break;
    }
    if (ok) scored.push({ s, score });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.s.name.localeCompare(b.s.name, 'sl') ||
        Number(a.s.code ?? Infinity) - Number(b.s.code ?? Infinity)
    )
    .slice(0, limit)
    .map(x => x.s);
}

const stopLabel = (s: StopListItem | undefined, id: string) => (s?.code ? `ID ${s.code}` : `#${id}`);

export function StopPicker({
  label,
  value,
  name,
  stopList,
  onChange,
  clearable,
}: {
  label: string;
  value: string;
  name?: string;
  stopList: StopListItem[];
  onChange: (stopId: string) => void;
  clearable?: boolean;
}) {
  const [query, setQuery] = useState('');
  /** Showing the search field instead of the chosen stop. */
  const [editing, setEditing] = useState(false);
  /** Results list visible under the search field. */
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => searchStops(stopList, query), [query, stopList]);
  const chosen = stopList.find(x => x.id === value);
  const showSearch = !value || editing;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const pick = (id: string) => {
    onChange(id);
    setQuery('');
    setListOpen(false);
    setEditing(false);
    setMapOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && matches.length) {
      e.preventDefault();
      setListOpen(true);
      setActive(a => (a + 1) % matches.length);
    } else if (e.key === 'ArrowUp' && matches.length) {
      e.preventDefault();
      setActive(a => (a - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (listOpen && matches[active]) pick(matches[active].id);
    } else if (e.key === 'Escape' && (listOpen || editing)) {
      // Close the list (or stop editing) without closing the dialog.
      e.preventDefault();
      if (listOpen && query) setListOpen(false);
      else {
        setQuery('');
        setEditing(false);
      }
    }
  };

  const mapToggle = (
    <button
      type="button"
      // Don't blur the search field: that would swap the layout under the pointer.
      onMouseDown={e => e.preventDefault()}
      onClick={() => setMapOpen(o => !o)}
      aria-pressed={mapOpen}
      aria-label="Pick on map"
      title="Pick on map"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium ${
        mapOpen ? 'border-accent text-accent' : 'border-line text-ink-2 hover:bg-surface-2'
      }`}
    >
      <MapIcon className="size-4" aria-hidden />
      <span className="hidden sm:inline">Map</span>
    </button>
  );

  return (
    <div className="relative">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      {!showSearch ? (
        <div className="mt-1 flex items-stretch gap-1.5">
          <button type="button" onClick={() => setEditing(true)} className="input flex min-w-0 flex-1 items-center justify-between text-left">
            <span className="truncate">
              {name ?? chosen?.name ?? 'Stop'} <span className="text-ink-3">{stopLabel(chosen, value)}</span>
            </span>
            <Pencil className="size-3.5 shrink-0 text-ink-3" />
          </button>
          {mapToggle}
          {clearable && (
            <button type="button" onClick={() => onChange('')} aria-label="Clear" className="rounded-lg p-2.5 text-ink-3 hover:bg-surface-2">
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1 flex items-stretch gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setActive(0);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              onBlur={() => {
                setListOpen(false);
                // Leaving an untouched search goes back to the chosen stop.
                if (!query) setEditing(false);
              }}
              onKeyDown={onKeyDown}
              placeholder="Stop name or ID from the sign"
              className="input pl-9"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              role="combobox"
              aria-expanded={listOpen && query.trim().length > 0}
              aria-controls={listId}
              aria-activedescendant={listOpen && matches[active] ? `${listId}-${active}` : undefined}
            />
            {listOpen && query.trim() && (
              <ul
                id={listId}
                role="listbox"
                className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-card"
              >
                {matches.map((s, i) => (
                  <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      // Keep focus in the input so blur doesn't close the list first.
                      onMouseDown={e => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(s.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm ${i === active ? 'bg-surface-2' : ''}`}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-ink-3">{stopLabel(s, s.id)}</span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="px-3 py-2.5 text-sm text-ink-3">
                    {stopList.length === 0 ? 'Loading stops…' : 'No stop matches. Try the map.'}
                  </li>
                )}
              </ul>
            )}
          </div>
          {mapToggle}
        </div>
      )}
      {mapOpen && <StopMapPicker stops={stopList} selectedId={value || undefined} onPick={pick} onCancel={() => setMapOpen(false)} />}
    </div>
  );
}
