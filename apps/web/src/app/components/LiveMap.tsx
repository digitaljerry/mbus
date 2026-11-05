'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker, Popup, GeoJSONSource } from 'maplibre-gl';
import { LocateFixed } from 'lucide-react';
import type { Vehicle } from '../types';
import type { NetworkLine } from '../lib/network';
import { readableTextOn } from '../lib/routeColors';

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  color: string;
}

export interface MapFocus {
  vehicleId?: string;
  stopId?: string;
  /** Changes on each request so repeated clicks re-center. */
  nonce: number;
}

interface Props {
  stops: MapStop[];
  vehicles: Vehicle[];
  focus?: MapFocus;
  /** Bumped when the map becomes visible after being hidden (mobile tab). */
  visibleKey?: string | number;
  /** Your position, shown as a blue dot (Nearby view). */
  userPosition?: { lat: number; lon: number } | null;
  /** All lines view: every line drawn in its colour (replaces per-bus route lines). */
  network?: NetworkLine[] | null;
  /** Highlight one line of the network and fade the rest. */
  highlightRoute?: string | null;
  className?: string;
}

const MARIBOR: [number, number] = [15.6467, 46.5547];
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function vehiclePopupHtml(v: Vehicle) {
  const age = Math.max(0, Math.round((Date.now() - v.timestamp) / 1000));
  return `<div style="min-width:10rem">
    <div style="font-weight:700;font-size:.9rem">${escapeHtml(v.route)} → ${escapeHtml(v.headsign ?? '')}</div>
    ${v.nextStop ? `<div style="font-size:.8rem;opacity:.75;margin-top:.15rem">Next: ${escapeHtml(v.nextStop)}</div>` : ''}
    <div style="font-size:.72rem;opacity:.6;margin-top:.25rem">Bus ${escapeHtml(v.plate ?? v.id)} · position ${age < 90 ? `${age}s` : `${Math.round(age / 60)} min`} old</div>
  </div>`;
}

function makeMarkerEl(v: Vehicle) {
  const el = document.createElement('div');
  el.className = 'bus-marker';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Bus ${v.route} to ${v.headsign ?? ''}`);
  el.innerHTML = `<div class="bus-marker__arrow"></div><div class="bus-marker__body"></div>`;
  return el;
}

function styleMarkerEl(el: HTMLElement, v: Vehicle, focused: boolean) {
  const body = el.querySelector<HTMLElement>('.bus-marker__body')!;
  const arrow = el.querySelector<HTMLElement>('.bus-marker__arrow')!;
  body.textContent = v.route;
  body.style.background = v.color;
  body.style.color = readableTextOn(v.color);
  arrow.style.setProperty('--arrow', v.color);
  arrow.style.transform = `rotate(${v.heading ?? 0}deg)`;
  arrow.style.display = v.heading === undefined || v.heading === null ? 'none' : '';
  el.classList.toggle('bus-marker--focused', focused);
}

export default function LiveMap({ stops, vehicles, focus, visibleKey, userPosition, network, highlightRoute, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import('maplibre-gl') | null>(null);
  const markersRef = useRef(new Map<string, { marker: Marker; el: HTMLElement; anim?: number }>());
  const popupRef = useRef<Popup | null>(null);
  const geometryCache = useRef(new Map<string, GeoJSON.LineString | null>());
  const [ready, setReady] = useState(false);
  const [focusedVehicle, setFocusedVehicle] = useState<string | undefined>();
  const fittedFor = useRef('');

  // --- init -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    import('maplibre-gl').then(lib => {
      if (cancelled || !containerRef.current) return;
      libRef.current = lib;
      const map = new lib.Map({
        container: containerRef.current,
        style: dark ? STYLE_DARK : STYLE_LIGHT,
        center: MARIBOR,
        zoom: 12.5,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(
        new lib.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }),
        'top-right'
      );
      map.on('load', () => {
        // Whole network (All lines view), drawn under everything else.
        map.addSource('network', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'network-casing',
          type: 'line',
          source: 'network',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': dark ? '#0b0e13' : '#ffffff', 'line-width': 6, 'line-opacity': 0.7 },
        });
        map.addLayer({
          id: 'network',
          type: 'line',
          source: 'network',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.85 },
        });
        map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'routes-casing',
          type: 'line',
          source: 'routes',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': dark ? '#0b0e13' : '#ffffff', 'line-width': 7, 'line-opacity': 0.8 },
        });
        map.addLayer({
          id: 'routes',
          type: 'line',
          source: 'routes',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.75 },
        });
        map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'stops',
          type: 'circle',
          source: 'stops',
          paint: {
            'circle-radius': 7,
            'circle-color': dark ? '#141922' : '#ffffff',
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 3,
          },
        });
        map.addLayer({
          id: 'stop-labels',
          type: 'symbol',
          source: 'stops',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'text-offset': [0, 1.2],
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
        setReady(true);
      });
      mapRef.current = map;
    });
    const markers = markersRef.current;
    return () => {
      cancelled = true;
      markers.forEach(m => m.marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Resize when revealed (e.g. switching to the Map tab on mobile).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => map.resize());
    return () => cancelAnimationFrame(id);
  }, [visibleKey]);

  // --- stops ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    (map.getSource('stops') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: stops.map(s => ({
        type: 'Feature',
        properties: { id: s.id, name: s.name, color: s.color },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
    });
    const signature = stops.map(s => s.id).sort().join(',');
    if (stops.length && signature !== fittedFor.current) {
      fittedFor.current = signature;
      const bounds = new lib.LngLatBounds();
      stops.forEach(s => bounds.extend([s.lon, s.lat]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
    }
  }, [stops, ready]);

  // --- network (All lines) ------------------------------------------------
  const networkFitted = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const lines = network ?? [];
    // The highlighted line is drawn last so it sits on top.
    const ordered = highlightRoute ? [...lines.filter(l => l.route !== highlightRoute), ...lines.filter(l => l.route === highlightRoute)] : lines;
    (map.getSource('network') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: ordered.flatMap(l =>
        l.variants.map(v => ({
          type: 'Feature' as const,
          properties: { route: l.route, color: l.color },
          geometry: { type: 'LineString' as const, coordinates: v.shape },
        }))
      ),
    });
    const hl = highlightRoute ?? '';
    map.setPaintProperty('network', 'line-opacity', hl ? ['case', ['==', ['get', 'route'], hl], 0.95, 0.12] : 0.85);
    map.setPaintProperty('network', 'line-width', hl ? ['case', ['==', ['get', 'route'], hl], 5.5, 3] : 3.5);
    map.setPaintProperty('network-casing', 'line-opacity', hl ? ['case', ['==', ['get', 'route'], hl], 0.9, 0] : 0.7);
    map.setPaintProperty('network-casing', 'line-width', hl ? 9 : 6);

    // Fit the whole network once, then the highlighted line when it changes.
    const target = lines.length ? (hl || 'all') : null;
    if (target && networkFitted.current !== target) {
      networkFitted.current = target;
      const bounds = new lib.LngLatBounds();
      lines.filter(l => !hl || l.route === hl).forEach(l => l.variants.forEach(v => v.shape.forEach(p => bounds.extend(p))));
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 700 });
    }
    if (!lines.length) networkFitted.current = null;
  }, [network, highlightRoute, ready]);

  // --- vehicles ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const markers = markersRef.current;
    const seen = new Set<string>();

    for (const v of vehicles) {
      seen.add(v.id);
      let entry = markers.get(v.id);
      if (!entry) {
        const el = makeMarkerEl(v);
        const marker = new lib.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(map);
        el.addEventListener('click', e => {
          e.stopPropagation();
          setFocusedVehicle(v.id);
        });
        entry = { marker, el };
        markers.set(v.id, entry);
      } else {
        // Glide from the previous position instead of jumping.
        const from = entry.marker.getLngLat();
        const to = { lng: v.lon, lat: v.lat };
        if (entry.anim) cancelAnimationFrame(entry.anim);
        const start = performance.now();
        const e = entry;
        const step = (t: number) => {
          const k = Math.min(1, (t - start) / 1200);
          const ease = 1 - Math.pow(1 - k, 3);
          e.marker.setLngLat([from.lng + (to.lng - from.lng) * ease, from.lat + (to.lat - from.lat) * ease]);
          if (k < 1) e.anim = requestAnimationFrame(step);
        };
        e.anim = requestAnimationFrame(step);
      }
      styleMarkerEl(entry.el, v, v.id === focusedVehicle);
    }
    markers.forEach((m, id) => {
      if (!seen.has(id)) {
        if (m.anim) cancelAnimationFrame(m.anim);
        m.marker.remove();
        markers.delete(id);
      }
    });

    // Popup follows the focused vehicle.
    const fv = vehicles.find(v => v.id === focusedVehicle);
    if (fv) {
      if (!popupRef.current) {
        popupRef.current = new lib.Popup({ offset: 18, closeOnClick: true, maxWidth: '260px' });
        popupRef.current.on('close', () => {
          popupRef.current = null;
          setFocusedVehicle(undefined);
        });
      }
      popupRef.current.setLngLat([fv.lon, fv.lat]).setHTML(vehiclePopupHtml(fv)).addTo(map);
    } else if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    // Draw the line for every trip on the map (shapes are cached).
    let cancelled = false;
    const trips = network?.length ? [] : [...new Map(vehicles.filter(v => v.tripId).map(v => [v.tripId!, v])).values()];
    Promise.all(
      trips.map(async v => {
        const id = v.tripId!;
        if (!geometryCache.current.has(id)) {
          try {
            const res = await fetch(`/api/geometry?trip=${encodeURIComponent(id)}`);
            geometryCache.current.set(id, res.ok ? await res.json() : null);
          } catch {
            geometryCache.current.set(id, null);
          }
        }
        const geom = geometryCache.current.get(id);
        return geom ? { type: 'Feature' as const, properties: { color: v.color }, geometry: geom } : null;
      })
    ).then(features => {
      if (cancelled || !mapRef.current) return;
      (mapRef.current.getSource('routes') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: features.filter(Boolean) as GeoJSON.Feature[],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [vehicles, ready, focusedVehicle, network]);

  // --- your position ----------------------------------------------------
  const userMarkerRef = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    if (!userPosition) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-dot';
      el.setAttribute('aria-label', 'You are here');
      userMarkerRef.current = new lib.Marker({ element: el }).setLngLat([userPosition.lon, userPosition.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userPosition.lon, userPosition.lat]);
    }
  }, [userPosition, ready]);

  // --- focus requests from the board -----------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    if (focus.vehicleId) {
      const v = vehicles.find(x => x.id === focus.vehicleId);
      if (v) {
        setFocusedVehicle(v.id);
        map.flyTo({ center: [v.lon, v.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
      }
    } else if (focus.stopId) {
      const s = stops.find(x => x.id === focus.stopId);
      if (s) map.flyTo({ center: [s.lon, s.lat], zoom: 16, duration: 800 });
    }
    // Only react to new focus requests, not to every vehicle update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce, ready]);

  const recenter = () => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib) return;
    const pts = [
      ...stops.map(s => [s.lon, s.lat] as [number, number]),
      ...(userPosition ? [[userPosition.lon, userPosition.lat] as [number, number]] : vehicles.map(v => [v.lon, v.lat] as [number, number])),
    ];
    if (!pts.length) return map.flyTo({ center: MARIBOR, zoom: 12.5 });
    const bounds = new lib.LngLatBounds();
    pts.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
  };

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />}
      <button
        onClick={recenter}
        className="absolute bottom-24 left-3 inline-flex lg:bottom-3 items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-ink shadow-card ring-1 ring-line"
      >
        <LocateFixed className="size-4" aria-hidden /> {network?.length ? "Fit lines" : "Fit journey"}
      </button>
      <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs font-medium text-ink-2 shadow-card ring-1 ring-line backdrop-blur">
        <span className="live-dot" aria-hidden />
        {vehicles.length === 0 ? 'No buses on these lines right now' : `${vehicles.length} live bus${vehicles.length === 1 ? '' : 'es'}`}
      </div>
    </div>
  );
}
