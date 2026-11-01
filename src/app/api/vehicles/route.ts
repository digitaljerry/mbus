import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import type { Vehicle } from '../../types';
import { routeColor } from '../../lib/routeColors';

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

async function loadVehicles(): Promise<Vehicle[]> {
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
      color: v.color && v.color !== '#000000' ? v.color : routeColor(v.route_short_name!),
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
