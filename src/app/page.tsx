'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { BusStop, ScheduleResponse } from './types';
import { loadPinnedStops, savePinnedStops } from './utils/storage';
import BusStopManager from './components/BusStopManager';

// Default stops to populate on first run
const DEFAULT_STOPS: BusStop[] = [
  {
    id: 'home-to-city',
    name: '🏠 Home → 🏙️ City',
    stops: [{ stopId: '255', route: 'G6' }],
    description: 'From Home to City Center'
  },
  {
    id: 'city-to-home',
    name: '🏙️ City → 🏠 Home',
    stops: [
      { stopId: '359', route: 'G6' },
      { stopId: '359', route: 'P18' }
    ],
    description: 'From City Center to Home'
  },
  {
    id: 'office-to-home',
    name: '🏢 Office → 🏠 Home',
    stops: [
      { stopId: '347', route: 'G6' },
      { stopId: '347', route: 'P18' }
    ],
    description: 'From Office to Home'
  },
  {
    id: 'school-to-city',
    name: '🏫 School → 🏙️ City',
    stops: [
      { stopId: '326', route: 'G6' },
      { stopId: '242', route: 'P18' }
    ],
    description: 'From School to City Center'
  },
  {
    id: 'school-to-home',
    name: '🏫 School → 🏠 Home',
    stops: [
      { stopId: '327', route: 'G6' },
      { stopId: '327', route: 'P18' }
    ],
    description: 'From School to Home'
  }
];

// Helper function to format delay
const formatDelay = (delaySeconds?: number): { text: string; color: string; bgColor: string } => {
  if (delaySeconds === undefined || delaySeconds === null) {
    return { text: '', color: '', bgColor: '' };
  }

  const delayMinutes = Math.round(delaySeconds / 60);
  
  if (delayMinutes <= 0) {
    return { text: 'On time', color: 'text-green-700', bgColor: 'bg-green-100' };
  } else if (delayMinutes <= 3) {
    return { text: `+${delayMinutes} min`, color: 'text-yellow-700', bgColor: 'bg-yellow-100' };
  } else {
    return { text: `+${delayMinutes} min`, color: 'text-red-700', bgColor: 'bg-red-100' };
  }
};

export default function Home() {
  const [pinnedStops, setPinnedStops] = useState<BusStop[]>([]);
  // Key format: `${busStopId}-${stopId}-${route}` to store schedules for each stop/route combination
  const [schedules, setSchedules] = useState<Record<string, ScheduleResponse | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isClient, setIsClient] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isManagerOpen, setIsManagerOpen] = useState<boolean>(false);
  
  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [startY, setStartY] = useState<number>(0);
  const [canPull, setCanPull] = useState<boolean>(true);

  const fetchSchedule = async (busStopId: string, stopId: string, route: string) => {
    const scheduleKey = `${busStopId}-${stopId}-${route}`;
    setLoading(prev => ({ ...prev, [scheduleKey]: true }));
    setFailed(prev => ({ ...prev, [scheduleKey]: false }));
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const response = await fetch(`/api/schedules?stop=${stopId}&route=${route}&datum=${today}`);
      const data = await response.json();
      
      setSchedules(prev => ({ ...prev, [scheduleKey]: data }));
      setFailed(prev => ({ ...prev, [scheduleKey]: false }));
    } catch (error) {
      console.error(`Error fetching schedule for stop ${stopId} route ${route}:`, error);
      setSchedules(prev => ({ ...prev, [scheduleKey]: null }));
      setFailed(prev => ({ ...prev, [scheduleKey]: true }));
    } finally {
      setLoading(prev => ({ ...prev, [scheduleKey]: false }));
    }
  };

  const fetchAllSchedules = async () => {
    setRefreshing(true);
    try {
      const fetchPromises: Promise<void>[] = [];
      pinnedStops.forEach(busStop => {
        busStop.stops.forEach(stopRoute => {
          fetchPromises.push(fetchSchedule(busStop.id, stopRoute.stopId, stopRoute.route));
        });
      });
      await Promise.allSettled(fetchPromises);
    } finally {
      setLastUpdated(new Date());
      setRefreshing(false);
    }
  };

  const handleStopsChange = (stops: BusStop[]) => {
    setPinnedStops(stops);
    // Clear schedules for removed stops
    setSchedules(prev => {
      const validKeys = new Set<string>();
      stops.forEach(busStop => {
        busStop.stops.forEach(stopRoute => {
          validKeys.add(`${busStop.id}-${stopRoute.stopId}-${stopRoute.route}`);
        });
      });
      const filtered: Record<string, ScheduleResponse | null> = {};
      Object.keys(prev).forEach(key => {
        if (validKeys.has(key)) {
          filtered[key] = prev[key];
        }
      });
      return filtered;
    });
    // Fetch schedules for new stops
    setTimeout(() => {
      fetchAllSchedules();
    }, 100);
  };

  // Helper function to merge and sort schedules from all stop/route combinations for a bus stop
  const getMergedSchedules = (busStop: BusStop) => {
    const allSchedules: Array<{ schedule: ScheduleResponse['schedules'][0]; route: string; stopId: string }> = [];
    
    busStop.stops.forEach(stopRoute => {
      const scheduleKey = `${busStop.id}-${stopRoute.stopId}-${stopRoute.route}`;
      const scheduleResponse = schedules[scheduleKey];
      if (scheduleResponse?.schedules) {
        scheduleResponse.schedules.forEach(schedule => {
          allSchedules.push({
            schedule,
            route: stopRoute.route,
            stopId: stopRoute.stopId
          });
        });
      }
    });

    // Sort by time (convert HH:MM to minutes for comparison)
    const timeToMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    allSchedules.sort((a, b) => {
      const timeA = timeToMinutes(a.schedule.time);
      const timeB = timeToMinutes(b.schedule.time);
      return timeA - timeB;
    });

    // Take top 3 schedules
    return allSchedules.slice(0, 3);
  };

  // Helper to check if any schedule is loading for a bus stop
  const isBusStopLoading = (busStop: BusStop): boolean => {
    return busStop.stops.some(stopRoute => {
      const scheduleKey = `${busStop.id}-${stopRoute.stopId}-${stopRoute.route}`;
      return loading[scheduleKey] === true;
    });
  };

  // Helper to check if any schedule failed for a bus stop
  const hasBusStopFailed = (busStop: BusStop): boolean => {
    return busStop.stops.some(stopRoute => {
      const scheduleKey = `${busStop.id}-${stopRoute.stopId}-${stopRoute.route}`;
      return failed[scheduleKey] === true;
    });
  };

  useEffect(() => {
    // Set client flag to true after component mounts
    setIsClient(true);
    setCurrentTime(format(new Date(), 'HH:mm:ss'));
    
    // Load pinned stops from localStorage
    let stops = loadPinnedStops();
    
    // If no stops found, initialize with default stops
    if (stops.length === 0) {
      savePinnedStops(DEFAULT_STOPS);
      stops = DEFAULT_STOPS;
    }
    
    setPinnedStops(stops);
    
    // Update clock every second
    const timer = setInterval(() => {
      setCurrentTime(format(new Date(), 'HH:mm:ss'));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Fetch schedules whenever pinned stops change (on initial load)
    if (pinnedStops.length > 0 && Object.keys(schedules).length === 0) {
      fetchAllSchedules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedStops.length]);

  // Pull-to-refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && canPull && !refreshing) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || refreshing) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0 && window.scrollY === 0) {
      // Limit pull distance and add resistance
      const distance = Math.min(deltaY * 0.5, 100);
      setPullDistance(distance);
      
      // Prevent default scrolling when pulling
      if (distance > 10) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !refreshing) {
      // Trigger refresh if pulled far enough
      setCanPull(false);
      setRefreshing(true);
      try {
        await fetchAllSchedules();
      } finally {
        setPullDistance(0);
        setIsPulling(false);
        setCanPull(true);
        setTimeout(() => setRefreshing(false), 300);
      }
    } else {
      // Reset if not pulled far enough
      setPullDistance(0);
      setIsPulling(false);
    }
  };



  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-amber-50 via-purple-50 to-purple-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateY(${pullDistance}px)`,
        transition: isPulling ? 'none' : 'transform 0.3s ease-out'
      }}
    >
      {/* Pull-to-refresh indicator */}
      <div 
        className="fixed top-0 left-0 right-0 flex items-center justify-center z-40 transition-opacity duration-200"
        style={{
          height: `${Math.min(pullDistance, 80)}px`,
          opacity: pullDistance > 10 ? 1 : 0,
          pointerEvents: 'none'
        }}
      >
        <div className="flex flex-col items-center gap-2">
          {pullDistance > 60 ? (
            <>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
              <span className="text-sm text-purple-600 font-medium">Release to refresh</span>
            </>
          ) : (
            <>
              <div 
                className="rounded-full h-6 w-6 border-2 border-purple-600"
                style={{
                  transform: `rotate(${pullDistance * 3}deg)`,
                  borderTopColor: 'transparent'
                }}
              ></div>
              <span className="text-sm text-purple-600 font-medium">Pull to refresh</span>
            </>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🚌 MBus 🚌
          </h1>
          <p className="text-gray-600">
            Your simplified Maribor bus schedule
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Current time: {isClient ? currentTime : '--:--:--'} • Last updated: {format(lastUpdated, 'HH:mm')}
          </p>
        </div>

        {pinnedStops.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-lg max-w-2xl mx-auto">
            <p className="text-xl text-gray-600 mb-4">No pinned stops yet!</p>
            <p className="text-gray-500 mb-6">Add your favorite bus stops to get started.</p>
            <button
              onClick={() => setIsManagerOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-colors duration-200"
            >
              📌 Add Your First Stop
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 max-w-7xl mx-auto">
            {pinnedStops.map((busStop) => (
            <div
              key={busStop.id}
              className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-400"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  {busStop.name}
                </h2>
                <div className="flex flex-wrap gap-1">
                  {busStop.stops.map((stopRoute, idx) => (
                    <span key={idx} className="text-sm bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                      Route {stopRoute.route}
                    </span>
                  ))}
                </div>
              </div>
              
              <p className="text-gray-600 text-sm mb-4">
                {busStop.description || ''}
              </p>

              {isBusStopLoading(busStop) ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              ) : hasBusStopFailed(busStop) ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">
                    ❌ Failed to load some schedules
                  </p>
                  <button
                    onClick={() => fetchAllSchedules()}
                    className="mt-2 text-sm text-purple-600 hover:text-purple-800 underline"
                  >
                    Try again
                  </button>
                </div>
              ) : (() => {
                const mergedSchedules = getMergedSchedules(busStop);
                return mergedSchedules.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-700 flex items-center gap-2">
                      🕐 Next departures:
                    </h3>
                    
                    {mergedSchedules.map((item, index) => (
                      <div
                        key={`${item.route}-${item.stopId}-${index}`}
                        className={`p-3 rounded-lg ${
                          index === 0
                            ? 'bg-amber-100 border border-amber-200'
                            : index === 1
                            ? 'bg-purple-100 border border-purple-200'
                            : 'bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-2xl font-bold ${
                              index === 0 ? 'text-amber-900' : 
                              index === 1 ? 'text-purple-900' : 
                              'text-slate-800'
                            }`}>
                              {item.schedule.time}
                            </span>
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                              {item.route}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.schedule.realtime && item.schedule.delay !== undefined && (() => {
                              const delayInfo = formatDelay(item.schedule.delay);
                              return delayInfo.text ? (
                                <span className={`text-xs ${delayInfo.color} ${delayInfo.bgColor} px-2 py-1 rounded-full font-medium`}>
                                  {delayInfo.text}
                                </span>
                              ) : null;
                            })()}
                            {index === 0 && (
                              <span className="text-xs bg-amber-500 text-purple-900 px-2 py-1 rounded-full">
                                NEXT
                              </span>
                            )}
                            {index === 1 && (
                              <span className="text-xs bg-purple-500 text-white px-2 py-1 rounded-full">
                                SOON
                              </span>
                            )}
                          </div>
                        </div>
                        {item.schedule.destination && (
                          <p className="text-sm text-gray-600 mt-1">
                            → {item.schedule.destination}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-800 text-sm">
                      😴 No more buses today or couldn&apos;t fetch schedule
                    </p>
                  </div>
                );
              })()}
            </div>
          ))}
          </div>
        )}

        {pinnedStops.length > 0 && (
          <div className="flex justify-center mt-8 mb-8">
            <button
              onClick={fetchAllSchedules}
              disabled={refreshing}
              className="bg-purple-600 hover:bg-purple-700 disabled:hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-colors duration-200 flex items-center gap-2"
            >
              {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Schedules'}
            </button>
          </div>
        )}

        {/* Manage Pinned Stops */}
        <div className="flex justify-center mt-4 mb-8">
          <button
            onClick={() => setIsManagerOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 disabled:hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-colors duration-200 flex items-center gap-2"
          >
            📌 Manage Pinned Stops
          </button>
        </div>

        <BusStopManager
          isOpen={isManagerOpen}
          onClose={() => setIsManagerOpen(false)}
          onStopsChange={handleStopsChange}
        />

        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>
            🚌 Built with ❤️ for simpler public transport in Maribor
          </p>
          <p className="mt-1">
            Data from{' '}
            <a
              href="https://api.beta.brezavta.si/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-700 hover:text-purple-900 underline"
            >
              Brezavta API
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
