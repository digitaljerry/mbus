import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import type { Vehicle } from '../../types';
import { routeColor } from '../../lib/routeColors';
import { fetchActiveVehicles, fetchLines } from '../../lib/oba';
import STOPS from '../../lib/marprom-stops.json';

// Bus positions from Marprom's real-time API, with brezavta as fallback.

const API_URL = 'https://api.beta.brezavta.si/vehicles/locations';
const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';
const TTL_MS = 10 * 1000;

interface BrezavtaVehicle {
  vehicle?: { id?: string; plate?: string; operator_name?: string };
  stop?: { name?: string };
  lat: number;
  lon: number;
  heading?: number;
  color?: string;
  trip_id?: string;
  trip_headsign?: string;
  route_short_name?: string;
  timestamp?: number;
}

let cache: { expires: number; vehicles: Vehicle[] } | null = null;

async function loadBrezavtaVehicles(): Promise<Vehicle[]> {
  if (cache && cache.expires > Date.now()) return cache.vehicles;
  const { data } = await axios.get<BrezavtaVehicle[]>(API_URL, {
    timeout: 10000,
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  const vehicles: Vehicle[] = (Array.isArray(data) ? data : [])
    .filter(v => v.vehicle?.id?.startsWith('MARPROM:') && v.route_short_name && Number.isFinite(v.lat))
    .map(v => ({
      id: v.vehicle!.id!,
      plate: v.vehicle?.plate,
      route: v.route_short_name!,
      color: routeColor(v.route_short_name!, v.color && v.color !== '#000000' ? v.color : undefined),
      lat: v.lat,
      lon: v.lon,
      heading: v.heading,
      headsign: v.trip_headsign,
      tripId: v.trip_id,
      nextStop: v.stop?.name,
      timestamp: (v.timestamp ?? Date.now() / 1000) * 1000,
    }));
  cache = { expires: Date.now() + TTL_MS, vehicles };
  return vehicles;
}

const stopNames = new Map(STOPS.map(s => [s.id, s.name]));
// Marprom sends no heading, so it's worked out from each bus's last two
// positions (kept per server instance).
const lastSeen = new Map<string, { lat: number; lon: number; heading?: number }>();

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function headingFor(id: string, lat: number, lon: number): number | undefined {
  const prev = lastSeen.get(id);
  let heading = prev?.heading;
  // ~15 m: less than that is GPS jitter at a stop.
  if (prev && Math.hypot(lat - prev.lat, (lon - prev.lon) * 0.69) > 0.000135) heading = Math.round(bearing(prev, { lat, lon }));
  if (!prev || heading !== prev.heading) lastSeen.set(id, { lat, lon, heading });
  if (lastSeen.size > 500) lastSeen.clear();
  return heading;
}

let obaCache: { expires: number; vehicles: Vehicle[] } | null = null;

async function loadObaVehicles(): Promise<Vehicle[]> {
  if (obaCache && obaCache.expires > Date.now()) return obaCache.vehicles;
  const [{ vehicles: raw, at }, lines] = await Promise.all([fetchActiveVehicles(), fetchLines()]);
  const lineById = new Map(lines.map(l => [l.LineId, l]));
  const vehicles: Vehicle[] = raw
    .filter(v => lineById.has(v.LineId) && Number.isFinite(v.Lat) && Number.isFinite(v.Lon) && v.Lat !== 0)
    .map(v => {
      const line = lineById.get(v.LineId)!;
      const id = `MARPROM:bus-${v.BusCode}`;
      // "E.Leclerc - ŽP Maribor - Šentiljska Hofer" → "Šentiljska Hofer"
      const direction = line.routes?.find(r => r.RouteId === v.RouteId)?.HeadsignName ?? v.DirectionDescription;
      return {
        id,
        plate: v.BusCode,
        busCode: v.BusCode,
        route: line.Code,
        color: routeColor(line.Code),
        lat: v.Lat,
        lon: v.Lon,
        heading: headingFor(id, v.Lat, v.Lon),
        headsign: direction?.split(' - ').at(-1)?.trim() || undefined,
        nextStop: v.NextStopPointId != null ? stopNames.get(String(v.NextStopPointId)) : undefined,
        timestamp: at,
      };
    });
  obaCache = { expires: Date.now() + TTL_MS, vehicles };
  return vehicles;
}

async function loadVehicles(): Promise<Vehicle[]> {
  try {
    return await loadObaVehicles();
  } catch {
    return loadBrezavtaVehicles();
  }
}

export async function GET(request: NextRequest) {
  const routes = new URL(request.url).searchParams
    .get('routes')
    ?.split(',')
    .map(r => r.trim().toUpperCase())
    .filter(Boolean);

  try {
    let vehicles = await loadVehicles();
    if (routes?.length) vehicles = vehicles.filter(v => routes.includes(v.route.toUpperCase()));
    return NextResponse.json(
      { vehicles, fetchedAt: Date.now() },
      { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' } }
    );
  } catch {
    return NextResponse.json({ vehicles: [], fetchedAt: Date.now(), error: 'Live positions unavailable' }, { status: 502 });
  }
}
