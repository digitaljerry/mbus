import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Debug flag - derived from environment so production logs stay quiet
const DEBUG = process.env.NODE_ENV !== 'production';

const CACHE_TTL_MS = 60 * 1000; // cache schedules for one minute per stop/route
const API_BASE_URL = 'https://api.beta.brezavta.si';
const WEBSITE_BASE_URL = 'https://brezavta.si';
const USER_AGENT = 'MBus/1.0 (Next.js; https://github.com/digitaljerry/mbus)';
const DEBUG_TARGET = {
  stop: '359',
  route: 'G6'
};

let debugActiveForRequest = false;

interface ScheduleResponsePayload {
  stop: string;
  route: string;
  date: string;
  schedules: Schedule[];
  url: string;
  note?: string;
}

const scheduleCache = new Map<string, { timestamp: number; payload: ScheduleResponsePayload }>();

interface Schedule {
  time: string;
  destination?: string;
}

interface BrezavtaArrival {
  agency_id: string;
  agency_name: string;
  route_id: string;
  route_short_name: string;
  route_color_background: string;
  route_color_text: string;
  trip_id: string;
  trip_headsign: string;
  realtime: boolean;
  realtime_status: string;
  passed: boolean;
  arrival_scheduled: number;
  arrival_realtime: number;
  arrival_delay: number;
  departure_scheduled: number;
  departure_realtime: number;
  departure_delay: number;
  alerts: unknown[];
}

const log = (...args: unknown[]) => {
  if (DEBUG && debugActiveForRequest) {
    console.log(...args);
  }
};

const logError = (...args: unknown[]) => {
  if (DEBUG && debugActiveForRequest) {
    console.error(...args);
  }
};

/**
 * Convert seconds since midnight to HH:MM format
 */
const secondsToTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Convert HH:MM format to minutes since midnight
 */
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.POSITIVE_INFINITY;
  }
  return hours * 60 + minutes;
};

/**
 * Get current time in minutes since midnight
 */
const getCurrentTimeMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/**
 * Format current time as HH:MM
 */
const getCurrentTimeFormatted = (): string => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stop = searchParams.get('stop');
  const route = searchParams.get('route');
  const datum = searchParams.get('datum') || new Date().toISOString().split('T')[0];

  const previousDebugState = debugActiveForRequest;
  debugActiveForRequest = Boolean(
    DEBUG &&
    stop === DEBUG_TARGET.stop &&
    route === DEBUG_TARGET.route
  );

  let cacheKey = '';
  let stopId = '';
  let routeId = '';

  try {
    log('🚌 API Request:', { stop, route, datum });

    if (!stop || !route) {
      log('❌ Missing parameters:', { stop, route });
      return NextResponse.json({ error: 'Missing stop or route parameter' }, { status: 400 });
    }

    stopId = stop as string;
    routeId = route as string;

    cacheKey = `${stopId}-${routeId}`;
    const cached = scheduleCache.get(cacheKey);
    // Check if cached entry exists and is valid (has correct URL format)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      // Validate cached URL format - if it's the old API URL, invalidate cache
      if (cached.payload.url && cached.payload.url.includes('/stops/') && cached.payload.url.includes('/arrivals')) {
        log('🗃️ Invalidating cache - old URL format detected');
        scheduleCache.delete(cacheKey);
      } else {
        log('🗃️ Serving schedules from cache');
        return NextResponse.json(cached.payload);
      }
    }

    if (cached) {
      scheduleCache.delete(cacheKey);
    }

    // Format stop ID for Brezavta API: MARPROM:255
    const apiStopId = `MARPROM:${stopId}`;
    const encodedStopId = encodeURIComponent(apiStopId);
    const apiUrl = `${API_BASE_URL}/stops/${encodedStopId}/arrivals`;
    const websiteUrl = `${WEBSITE_BASE_URL}/stop/${apiStopId}`;
    
    log('🌐 Fetching from Brezavta API:', apiUrl);

    let arrivals: BrezavtaArrival[] = [];

    try {
      const response = await axios.get<BrezavtaArrival[]>(apiUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT
        }
      });

      log('✅ API Response received, status:', response.status);
      log('📊 Total arrivals received:', response.data.length);

      arrivals = response.data;

      // Filter by route if specified
      if (routeId) {
        const beforeFilter = arrivals.length;
        arrivals = arrivals.filter(arrival => arrival.route_short_name === routeId);
        log(`🚌 Filtered by route ${routeId}: ${arrivals.length}/${beforeFilter} arrivals`);
      }

      // Filter out passed arrivals
      const beforePassedFilter = arrivals.length;
      arrivals = arrivals.filter(arrival => !arrival.passed);
      log(`⏭️ Future arrivals (not passed): ${arrivals.length}/${beforePassedFilter}`);

      // Sort by arrival time and take next 3
      arrivals.sort((a, b) => {
        const timeA = a.realtime ? a.arrival_realtime : a.arrival_scheduled;
        const timeB = b.realtime ? b.arrival_realtime : b.arrival_scheduled;
        return timeA - timeB;
      });

      arrivals = arrivals.slice(0, 3);
      log(`📋 Next 3 arrivals: ${arrivals.map(a => secondsToTime(a.realtime ? a.arrival_realtime : a.arrival_scheduled)).join(', ')}`);

    } catch (apiError) {
      logError('❌ API request failed:', apiError);
      if (axios.isAxiosError(apiError)) {
        logError('❌ Response status:', apiError.response?.status);
        logError('❌ Response data:', apiError.response?.data);
      }
      throw apiError;
    }

    // Convert arrivals to Schedule format
    const currentMinutes = getCurrentTimeMinutes();
    const currentTime = getCurrentTimeFormatted();
    log(`🕐 Current time: ${currentTime} (${currentMinutes} minutes)`);

    const schedules: Schedule[] = arrivals.map(arrival => {
      const arrivalTime = arrival.realtime ? arrival.arrival_realtime : arrival.arrival_scheduled;
      const timeStr = secondsToTime(arrivalTime);
      
      return {
        time: timeStr,
        destination: arrival.trip_headsign || undefined
      };
    });

    // Filter to only future schedules (in case API returned some that are very close to current time)
    const futureSchedules = schedules.filter(schedule => {
      const scheduleMinutes = timeToMinutes(schedule.time);
      return scheduleMinutes > currentMinutes;
    });

    log(`⏭️ Future schedules after time filter: ${futureSchedules.length}`);

    // If no future schedules, show next available (might be tomorrow)
    const displaySchedules = futureSchedules.length > 0 ? futureSchedules : schedules.slice(0, 3);

    const result: ScheduleResponsePayload = {
      stop: stopId,
      route: routeId,
      date: datum,
      schedules: displaySchedules,
      url: websiteUrl,
      note: futureSchedules.length === 0 && schedules.length > 0 
        ? 'No more buses today - showing next available departures'
        : undefined
    };

    scheduleCache.set(cacheKey, { timestamp: Date.now(), payload: result });
    log('📤 Returning result:', result);
    return NextResponse.json(result);

  } catch (error) {
    logError('❌ Major error in API:', error);

    const fallbackResult: ScheduleResponsePayload = { 
      stop: stopId,
      route: routeId,
      date: datum,
      schedules: [],
      url: `${WEBSITE_BASE_URL}/stop/MARPROM:${stopId}`,
      note: 'Unable to fetch schedule data from API'
    };
    
    if (cacheKey) {
      scheduleCache.delete(cacheKey);
    }
    
    log('📤 Returning error result:', fallbackResult);
    return NextResponse.json(fallbackResult, { status: 500 });
  } finally {
    debugActiveForRequest = previousDebugState;
  }
}
