import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Mock data for demonstration - in a real app, you'd want to scrape or use an API
const MOCK_SCHEDULES: Record<string, string[]> = {
  '255': ['07:15', '07:45', '08:15', '08:45', '09:15', '09:45', '10:15', '10:45', '11:15', '11:45', '12:15', '12:45', '13:15', '13:45', '14:15', '14:45', '15:15', '15:45', '16:15', '16:45', '17:15', '17:45', '18:15', '18:45', '19:15', '19:45', '20:15', '20:45'],
  '359': ['07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'],
  '347': ['07:20', '07:50', '08:20', '08:50', '09:20', '09:50', '10:20', '10:50', '11:20', '11:50', '12:20', '12:50', '13:20', '13:50', '14:20', '14:50', '15:20', '15:50', '16:20', '16:50', '17:20', '17:50', '18:20', '18:50', '19:20', '19:50', '20:20']
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stop = searchParams.get('stop');
  const route = searchParams.get('route');
  const datum = searchParams.get('datum') || new Date().toISOString().split('T')[0];

  if (!stop || !route) {
    return NextResponse.json({ error: 'Missing stop or route parameter' }, { status: 400 });
  }

  try {
    const url = `https://vozniredi.marprom.si/?stop=${stop}&datum=${datum}&route=${route}`;
    let schedules: Array<{ time: string; destination?: string }> = [];

    try {
      // Try to fetch real data first
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 5000
      });

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

      for (const selector of selectors) {
        if (schedules.length === 0) {
          $(selector).each((index, element) => {
            const text = $(element).text().trim();
            const timeMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
            if (timeMatch && timeMatch[1] !== '00:00') {
              schedules.push({
                time: timeMatch[1],
                destination: text.replace(timeMatch[1], '').trim() || undefined
              });
            }
          });
        }
      }

      // Remove duplicates
      schedules = schedules.filter((schedule, index, self) => 
        index === self.findIndex(s => s.time === schedule.time)
      );

    } catch (scrapeError) {
      console.log('Scraping failed, using mock data:', scrapeError);
    }

    // If scraping failed or returned no results, use mock data
    if (schedules.length === 0 && MOCK_SCHEDULES[stop]) {
      schedules = MOCK_SCHEDULES[stop].map(time => ({ time }));
    }

    // Filter and sort schedules to get next departures
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const futureSchedules = schedules
      .filter(schedule => schedule.time > currentTime)
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(0, 2);

    // If no future schedules for today, get first two of tomorrow
    if (futureSchedules.length === 0) {
      const allSchedules = schedules.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 2);
      return NextResponse.json({
        stop,
        route,
        date: datum,
        schedules: allSchedules.map(s => ({ ...s, time: `${s.time} (+1 day)` })),
        url,
        note: 'No more buses today - showing tomorrow\'s first departures'
      });
    }

    return NextResponse.json({
      stop,
      route,
      date: datum,
      schedules: futureSchedules,
      url
    });

  } catch (error) {
    console.error('Error fetching schedules:', error);
    
    // Fallback to mock data
    const mockTimes = MOCK_SCHEDULES[stop] || ['08:00', '08:30'];
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const futureSchedules = mockTimes
      .filter(time => time > currentTime)
      .slice(0, 2)
      .map(time => ({ time }));

    return NextResponse.json({ 
      stop,
      route,
      date: datum,
      schedules: futureSchedules,
      url: `https://vozniredi.marprom.si/?stop=${stop}&datum=${datum}&route=${route}`,
      note: 'Using sample data - real-time data unavailable'
    });
  }
}
