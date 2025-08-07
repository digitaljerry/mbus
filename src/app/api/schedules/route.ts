import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Debug flag - set to true to enable detailed logging
const DEBUG = true;

interface ScrapedSchedule {
  time: string;
  destination?: string;
  routeInfo?: string;
  isG6Route?: boolean;
  fullText?: string;
  rowText?: string;
}

interface Schedule {
  time: string;
  destination?: string;
}

const log = (...args: unknown[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

// Mock data for demonstration - in a real app, you'd want to scrape or use an API
const MOCK_SCHEDULES: Record<string, string[]> = {
  '255': ['07:15', '07:45', '08:15', '08:45', '09:15', '09:45', '10:15', '10:45', '11:15', '11:45', '12:15', '12:45', '13:15', '13:45', '14:15', '14:45', '15:15', '15:45', '16:15', '16:45', '17:15', '17:45', '18:15', '18:45', '19:15', '19:45', '20:15', '20:45'],
  '359': ['07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'],
  '347': ['07:20', '07:50', '08:20', '08:50', '09:20', '09:50', '10:20', '10:50', '11:20', '11:50', '12:20', '12:50', '13:20', '13:50', '14:20', '14:50', '15:20', '15:50', '16:20', '16:50', '17:20', '17:50', '18:20', '18:50', '19:20', '19:50', '20:20'],
  '157': ['07:10', '07:40', '08:10', '08:40', '09:10', '09:40', '10:10', '10:40', '11:10', '11:40', '12:10', '12:40', '13:10', '13:40', '14:10', '14:40', '15:10', '15:40', '16:10', '16:40', '17:10', '17:40', '18:10', '18:40', '19:10', '19:40', '20:10'],
  '158': ['07:25', '07:55', '08:25', '08:55', '09:25', '09:55', '10:25', '10:55', '11:25', '11:55', '12:25', '12:55', '13:25', '13:55', '14:25', '14:55', '15:25', '15:55', '16:25', '16:55', '17:25', '17:55', '18:25', '18:55', '19:25', '19:55', '20:25']
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stop = searchParams.get('stop');
  const route = searchParams.get('route');
  const datum = searchParams.get('datum') || new Date().toISOString().split('T')[0];

  log('🚌 API Request:', { stop, route, datum });

  if (!stop || !route) {
    log('❌ Missing parameters:', { stop, route });
    return NextResponse.json({ error: 'Missing stop or route parameter' }, { status: 400 });
  }

  try {
    const url = `https://vozniredi.marprom.si/?stop=${stop}&datum=${datum}&route=${route}`;
    log('🌐 Fetching URL:', url);
    let schedules: ScrapedSchedule[] = [];

    try {
      // Try to fetch real data first
      log('📡 Starting real data fetch...');
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 5000
      });

      log('✅ Response received, status:', response.status);
      log('📄 Response length:', response.data.length);
      
      const $ = cheerio.load(response.data);
      
      // Try multiple selectors to find schedule data
      const selectors = [
        'table td:contains(":")',
        '.time',
        '.schedule-time',
        'td',
        'span:contains(":")',
        'div:contains(":")'
      ];

      log('🔍 Trying selectors to find schedule data...');
      
      for (const selector of selectors) {
        if (schedules.length === 0) {
          log(`🎯 Trying selector: ${selector}`);
          const elements = $(selector);
          log(`📊 Found ${elements.length} elements for selector: ${selector}`);
          
          $(selector).each((index, element) => {
            const text = $(element).text().trim();
            const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
            if (timeMatch && timeMatch[1] !== '00:00') {
              // Try to find route information in the surrounding context
              const $element = $(element);
              const rowText = $element.closest('tr').text().trim();
              const parentText = $element.parent().text().trim();
              
              // Look for G6 route indicators - only full route descriptions
              const g6RouteIndicators = [
                'G6',
                'Avtobusna postaja - Vzpenjača',
                'Vzpenjača - Avtobusna postaja'
              ];
              
              // Also check for other route indicators for debugging
              const allRouteIndicators = [
                'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9',
                'P7', 'P8', 'P9', 'P10', 'P11', 'P12',
                'Avtobusna postaja - Vzpenjača',
                'Vzpenjača - Avtobusna postaja'
              ];
              
              let routeInfo = 'Unknown';
              let isG6Route = false;
              
              // Check for G6 specific routes
              for (const indicator of g6RouteIndicators) {
                if (rowText.includes(indicator) || parentText.includes(indicator) || text.includes(indicator)) {
                  routeInfo = indicator;
                  isG6Route = true;
                  break;
                }
              }
              
              // If not G6, check what other route it might be (for debugging)
              if (!isG6Route) {
                for (const indicator of allRouteIndicators) {
                  if (rowText.includes(indicator) || parentText.includes(indicator) || text.includes(indicator)) {
                    routeInfo = indicator;
                    break;
                  }
                }
              }
              
              log(`⏰ Found time: ${timeMatch[1]} in text: "${text}" | Row: "${rowText}" | Route: ${routeInfo} | Is G6: ${isG6Route}`);
              
              schedules.push({
                time: timeMatch[1],
                destination: text.replace(timeMatch[1], '').trim() || undefined,
                routeInfo: routeInfo,
                isG6Route: isG6Route,
                fullText: text,
                rowText: rowText
              });
            }
          });
          
          if (schedules.length > 0) {
            log(`✅ Found ${schedules.length} schedules with selector: ${selector}`);
            break;
          }
        }
      }

      // Remove duplicates
      const originalLength = schedules.length;
      schedules = schedules.filter((schedule, index, self) => 
        index === self.findIndex(s => s.time === schedule.time)
      );
      log(`🔄 Removed ${originalLength - schedules.length} duplicates`);
      log('📋 All scraped schedules:', schedules);
      
      // Filter for G6 routes only
      const g6Schedules = schedules.filter(schedule => schedule.isG6Route);
      log(`🚌 G6 schedules found: ${g6Schedules.length}/${schedules.length}`);
      log('📋 G6 schedules:', g6Schedules);
      
      // Use G6 schedules if found, otherwise keep all (fallback)
      if (g6Schedules.length > 0) {
        schedules = g6Schedules;
        log('✅ Using filtered G6 schedules');
      } else {
        log('⚠️ No G6 schedules found, keeping all schedules as fallback');
      }

    } catch (scrapeError) {
      log('❌ Scraping failed:', scrapeError);
      log('🔄 Will fall back to mock data');
    }

    // If scraping failed or returned no results, use mock data
    if (schedules.length === 0 && MOCK_SCHEDULES[stop]) {
      log(`📦 Using mock data for stop ${stop}`);
      schedules = MOCK_SCHEDULES[stop].map(time => ({ time }));
      log(`📋 Mock schedules loaded: ${schedules.length} times`);
    } else if (schedules.length === 0) {
      log(`❌ No mock data available for stop ${stop}`);
    }

    // Convert to clean Schedule objects for filtering
    const cleanSchedules: Schedule[] = schedules.map(s => ({
      time: s.time,
      destination: s.destination
    }));

    // Filter and sort schedules to get next departures
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    log(`🕐 Current time: ${currentTime}`);
    log(`📋 All schedules before filtering: ${cleanSchedules.map(s => s.time).join(', ')}`);
    
    const futureSchedules = cleanSchedules
      .filter(schedule => schedule.time > currentTime)
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(0, 2);
    
    log(`⏭️ Future schedules (next 2): ${futureSchedules.map(s => s.time).join(', ')}`);

    // If no future schedules for today, get first two of tomorrow
    if (futureSchedules.length === 0) {
      log('🌙 No future schedules for today, showing tomorrow\'s first departures');
      const allSchedules = cleanSchedules.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 2);
      log(`🌅 Tomorrow's first departures: ${allSchedules.map(s => s.time).join(', ')}`);
      
      const result = {
        stop,
        route,
        date: datum,
        schedules: allSchedules.map(s => ({ ...s, time: `${s.time} (+1 day)` })),
        url,
        note: 'No more buses today - showing tomorrow\'s first departures'
      };
      log('📤 Returning result (tomorrow):', result);
      return NextResponse.json(result);
    }

    const result = {
      stop,
      route,
      date: datum,
      schedules: futureSchedules,
      url
    };
    log('📤 Returning result (today):', result);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Major error in API:', error);
    
    // Fallback to mock data
    log('🔄 Using fallback mock data due to major error');
    const mockTimes = MOCK_SCHEDULES[stop] || ['08:00', '08:30'];
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    log(`🕐 Fallback current time: ${currentTime}`);
    log(`📦 Fallback mock times: ${mockTimes.join(', ')}`);
    
    const futureSchedules = mockTimes
      .filter(time => time > currentTime)
      .slice(0, 2)
      .map(time => ({ time }));

    log(`⏭️ Fallback future schedules: ${futureSchedules.map(s => s.time).join(', ')}`);

    const fallbackResult = { 
      stop,
      route,
      date: datum,
      schedules: futureSchedules,
      url: `https://vozniredi.marprom.si/?stop=${stop}&datum=${datum}&route=${route}`,
      note: 'Using sample data - real-time data unavailable'
    };
    log('📤 Returning fallback result:', fallbackResult);
    return NextResponse.json(fallbackResult);
  }
}
