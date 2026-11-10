'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, GeoJSONSource, PointLike } from 'maplibre-gl';
import { Check, MapPin } from 'lucide-react';
import type { StopListItem } from './BusStopManager';

interface Props {
  stops: StopListItem[];
  /** Currently chosen stop, shown highlighted and centred. */
  selectedId?: string;
  onPick: (stopId: string) => void;
  onCancel: () => void;
}

const MARIBOR: [number, number] = [15.6467, 46.5547];
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
/** Tap slop in px around the pointer, so small stop dots are easy to hit. */
const HIT = 14;

/** Pick a stop by tapping it on a map. Stops come in pairs across the street, so labels show the sign ID. */
export default function StopMapPicker({ stops, selectedId, onPick, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<string | undefined>(selectedId);
  const withPos = stops.filter(s => typeof s.lat === 'number' && typeof s.lon === 'number');
  const pendingStop = stops.find(s => s.id === pending);

  // --- init -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d71921';
    const start = selectedId ? stops.find(s => s.id === selectedId) : undefined;

    import('maplibre-gl').then(lib => {
      if (cancelled || !containerRef.current) return;
      const map = new lib.Map({
        container: containerRef.current,
        style: dark ? STYLE_DARK : STYLE_LIGHT,
        center: start?.lat != null && start.lon != null ? [start.lon, start.lat] : MARIBOR,
        zoom: start ? 16 : 13,
        attributionControl: { compact: true },
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new lib.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');

      map.on('load', () => {
        map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'stops',
          type: 'circle',
          source: 'stops',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 6, 17, 9],
            'circle-color': dark ? '#141922' : '#ffffff',
            'circle-stroke-color': dark ? '#94a3b8' : '#475569',
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 2.5],
          },
        });
        map.addLayer({
          id: 'stop-picked',
          type: 'circle',
          source: 'stops',
          filter: ['==', ['get', 'id'], ''],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 9, 17, 12],
            'circle-color': accent,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3,
          },
        });
        map.addLayer({
          id: 'stop-labels',
          type: 'symbol',
          source: 'stops',
          minzoom: 14.5,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-offset': [0, 1],
            'text-anchor': 'top',
            'text-font': ['Noto Sans Regular'],
            'text-optional': true,
          },
          paint: {
            'text-color': dark ? '#e2e8f0' : '#0f172a',
            'text-halo-color': dark ? '#0b0e13' : '#ffffff',
            'text-halo-width': 1.5,
          },
        });

        const hitBox = (p: { x: number; y: number }): [PointLike, PointLike] => [
          [p.x - HIT, p.y - HIT],
          [p.x + HIT, p.y + HIT],
        ];
        map.on('click', e => {
          const hits = map.queryRenderedFeatures(hitBox(e.point), { layers: ['stops'] });
          if (!hits.length) return;
          // Closest dot to the tap wins.
          const nearest = hits
            .map(f => {
              const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
              const p = map.project([lon, lat]);
              return { id: String(f.properties?.id), d: (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2 };
            })
            .sort((a, b) => a.d - b.d)[0];
          setPending(nearest.id);
          if (map.getZoom() < 15) map.easeTo({ center: e.lngLat, zoom: 16, duration: 500 });
        });
        map.on('mousemove', e => {
          const over = map.queryRenderedFeatures(hitBox(e.point), { layers: ['stops'] }).length > 0;
          map.getCanvas().style.cursor = over ? 'pointer' : '';
        });
        setReady(true);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Initial centre only; later selection changes don't move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- data ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('stops') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: withPos.map(s => ({
        type: 'Feature',
        properties: { id: s.id, label: s.code ? `${s.name}\n${s.code}` : s.name },
        geometry: { type: 'Point', coordinates: [s.lon!, s.lat!] },
      })),
    });
    // withPos is derived from stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter('stop-picked', ['==', ['get', 'id'], pending ?? '']);
  }, [pending, ready]);

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line">
      <div className="relative h-72">
        <div ref={containerRef} className="h-full w-full" />
        {!ready && <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />}
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
        {pendingStop ? (
          <p className="min-w-0 flex-1 truncate text-sm">
            <MapPin className="mr-1 inline size-4 text-accent" aria-hidden />
            {pendingStop.name} <span className="text-ink-3">{pendingStop.code ? `ID ${pendingStop.code}` : `#${pendingStop.id}`}</span>
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-xs text-ink-3">Tap a stop. Zoom in to see names and sign IDs.</p>
        )}
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => pending && onPick(pending)}
          disabled={!pending}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-40"
        >
          <Check className="size-4" aria-hidden /> Use stop
        </button>
      </div>
    </div>
  );
}
