'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface Schedule {
  time: string;
  destination?: string;
}

interface BusStop {
  id: string;
  name: string;
  stopId: string;
  route: string;
  description: string;
}

interface ScheduleResponse {
  stop: string;
  route: string;
  date: string;
  schedules: Schedule[];
  url: string;
  note?: string;
}

const BUS_STOPS: BusStop[] = [
  {
    id: 'home-to-city',
    name: '🏠 Home → 🏙️ City',
    stopId: '255',
    route: 'G6',
    description: 'From Home to City Center'
  },
  {
    id: 'city-to-home',
    name: '🏙️ City → 🏠 Home',
    stopId: '359',
    route: 'G6',
    description: 'From City Center to Home'
  },
  {
    id: 'office-to-home',
    name: '🏢 Office → 🏠 Home',
    stopId: '347',
    route: 'G6',
    description: 'From Office to Home'
  },
  {
    id: 'school-to-city',
    name: '🏫 School → 🏙️ City',
    stopId: '326',
    route: 'G6',
    description: 'From School to City Center'
  },
  {
    id: 'school-to-home',
    name: '🏫 School → 🏠 Home',
    stopId: '327',
    route: 'G6',
    description: 'From School to Home'
  }
];

export default function Home() {
  const [schedules, setSchedules] = useState<Record<string, ScheduleResponse | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isClient, setIsClient] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchSchedule = async (busStop: BusStop) => {
    setLoading(prev => ({ ...prev, [busStop.id]: true }));
    setFailed(prev => ({ ...prev, [busStop.id]: false }));
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const response = await fetch(`/api/schedules?stop=${busStop.stopId}&route=${busStop.route}&datum=${today}`);
      const data = await response.json();
      
      setSchedules(prev => ({ ...prev, [busStop.id]: data }));
      setFailed(prev => ({ ...prev, [busStop.id]: false }));
    } catch (error) {
      console.error(`Error fetching schedule for ${busStop.name}:`, error);
      setSchedules(prev => ({ ...prev, [busStop.id]: null }));
      setFailed(prev => ({ ...prev, [busStop.id]: true }));
    } finally {
      setLoading(prev => ({ ...prev, [busStop.id]: false }));
    }
  };

  const fetchAllSchedules = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled(BUS_STOPS.map((busStop) => fetchSchedule(busStop)));
    } finally {
      setLastUpdated(new Date());
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Set client flag to true after component mounts
    setIsClient(true);
    setCurrentTime(format(new Date(), 'HH:mm:ss'));
    
    fetchAllSchedules();
    
    // Update clock every second
    const timer = setInterval(() => {
      setCurrentTime(format(new Date(), 'HH:mm:ss'));
    }, 1000);

    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps



  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
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

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 max-w-7xl mx-auto">
          {BUS_STOPS.map((busStop) => (
            <div
              key={busStop.id}
              className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  {busStop.name}
                </h2>
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  Route {busStop.route}
                </span>
              </div>
              
              <p className="text-gray-600 text-sm mb-4">
                {busStop.description}
              </p>

              {loading[busStop.id] ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Loading...</span>
                </div>
              ) : failed[busStop.id] ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">
                    ❌ Failed to load schedule
                  </p>
                  <button
                    onClick={() => fetchSchedule(busStop)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Try again
                  </button>
                </div>
              ) : schedules[busStop.id] ? (
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-700 flex items-center gap-2">
                    🕐 Next departures:
                  </h3>
                  
                  {schedules[busStop.id]?.note && (
                    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-blue-800 text-xs">
                        ℹ️ {schedules[busStop.id]!.note}
                      </p>
                    </div>
                  )}
                  
                  {schedules[busStop.id]?.schedules?.length ? (
                    schedules[busStop.id]!.schedules.map((schedule, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg ${
                          index === 0
                            ? 'bg-green-50 border border-green-200'
                            : index === 1
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-2xl font-bold ${
                            index === 0 ? 'text-green-800' : 
                            index === 1 ? 'text-blue-800' : 
                            'text-gray-800'
                          }`}>
                            {schedule.time}
                          </span>
                          {index === 0 && (
                            <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                              NEXT
                            </span>
                          )}
                          {index === 1 && (
                            <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">
                              SOON
                            </span>
                          )}
                        </div>
                        {schedule.destination && (
                          <p className="text-sm text-gray-600 mt-1">
                            → {schedule.destination}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-yellow-800 text-sm">
                        😴 No more buses today or couldn&apos;t fetch schedule
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-gray-600 text-sm">
                    ⏳ Waiting to load...
                  </p>
                </div>
              )}

              {schedules[busStop.id]?.url && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <a
                    href={schedules[busStop.id]!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    🔗 View original schedule
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-8 mb-8">
          <button
            onClick={fetchAllSchedules}
            disabled={refreshing}
            className="bg-blue-500 hover:bg-blue-600 disabled:hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-colors duration-200 flex items-center gap-2"
          >
            {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Schedules'}
          </button>
        </div>

        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>
            🚌 Built with ❤️ for simpler public transport in Maribor
          </p>
          <p className="mt-1">
            Data from{' '}
            <a
              href="https://vozniredi.marprom.si/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Marprom
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
