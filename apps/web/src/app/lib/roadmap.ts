// Single source of truth for the About page's feature matrix.
// Keep docs/ios-app-plan.md in sync when this changes.

export type Status = 'live' | 'beta' | 'next' | 'planned' | 'later' | 'not-possible';

export interface PlatformStatus {
  status: Status;
  note?: string;
}

export interface Feature {
  name: string;
  description: string;
  web: PlatformStatus;
  ios: PlatformStatus;
}

export interface FeatureGroup {
  title: string;
  features: Feature[];
}

export const STATUS_LABEL: Record<Status, string> = {
  live: 'Live',
  beta: 'Beta',
  next: 'Next',
  planned: 'Planned',
  later: 'Later',
  'not-possible': 'Not possible',
};

export const ROADMAP: FeatureGroup[] = [
  {
    title: 'Departures',
    features: [
      {
        name: 'Journey board',
        description: 'Your journeys (e.g. Home → School) with departures from every stop and line you might take, merged and sorted.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Live countdowns',
        description: 'Minutes to the next bus, switching to m:ss in the last 10 minutes.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Tap to track',
        description: 'Full-screen countdown for one bus that follows its delay.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Real-time delays',
        description: 'Live estimates whenever Marprom publishes them for a trip.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Timetable fallback',
        description: "Uses Marprom's official timetable when the live feed has gaps, including tomorrow's first buses late at night.",
        web: { status: 'live' },
        ios: { status: 'planned', note: 'Same backend' },
      },
      {
        name: 'Arrival time',
        description: 'Set where you get off to see when you arrive and how long the ride is.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Auto-refresh',
        description: 'Updates every 30 s while open, pauses in the background, catches up when you return.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Service alerts',
        description: 'Diversions and disruptions shown on the affected journeys.',
        web: { status: 'next' },
        ios: { status: 'planned', note: 'M3' },
      },
    ],
  },
  {
    title: 'Map & location',
    features: [
      {
        name: 'Live bus map',
        description: 'Buses on your lines moving in real time, with route lines and your stops.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0 · MapKit' },
      },
      {
        name: 'All lines map',
        description: 'Every line drawn in its colour with all live buses; tap a line for its stops, plus Marprom\'s network and line PDFs.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M3' },
      },
      {
        name: 'Nearby stops',
        description: 'Stops within walking distance of you, with what leaves next on every line.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M3' },
      },
      {
        name: 'Walking directions',
        description: 'Directions to a stop from where you are.',
        web: { status: 'live', note: 'Opens Google Maps' },
        ios: { status: 'planned', note: 'Apple Maps, M3' },
      },
      {
        name: '"You\'re at your stop" suggestions',
        description: 'Offer to track your usual bus when you arrive at its stop at the usual time.',
        web: { status: 'not-possible', note: 'Needs background location' },
        ios: { status: 'later', note: 'v2 · region monitoring' },
      },
    ],
  },
  {
    title: 'Your buses',
    features: [
      {
        name: 'Journey shortcuts',
        description: 'One-tap chips, links like /?j=home-to-school, and home-screen icon shortcuts.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'App Shortcuts, M4' },
      },
      {
        name: 'Usual buses',
        description: 'Bookmark the bus you take regularly, with days and walking time, to get a leave-by time.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M1' },
      },
      {
        name: 'Reminders',
        description: "A notification before it's time to leave for your usual bus.",
        web: { status: 'beta', note: 'Web Push. On iPhone: add to Home Screen first' },
        ios: { status: 'planned', note: 'M1 · local notifications' },
      },
      {
        name: 'Delay-aware reminders',
        description: 'A late bus moves your reminder later.',
        web: { status: 'beta', note: 'Checked when the reminder is due' },
        ios: { status: 'planned', note: 'M5 · server push' },
      },
      {
        name: 'Keep screen awake',
        description: 'The screen stays on while your bus is under 10 minutes away.',
        web: { status: 'live', note: 'iOS 16.4+, recent Android' },
        ios: { status: 'planned', note: 'M0' },
      },
    ],
  },
  {
    title: 'Glanceable',
    features: [
      {
        name: 'Live Activities & Dynamic Island',
        description: 'Countdown on the lock screen and Dynamic Island while you head to the stop.',
        web: { status: 'not-possible' },
        ios: { status: 'planned', note: 'M2 · push updates M5' },
      },
      {
        name: 'Widgets',
        description: 'Home-screen and lock-screen widgets for your next or usual bus.',
        web: { status: 'not-possible' },
        ios: { status: 'planned', note: 'M2' },
      },
      {
        name: 'Siri & Shortcuts',
        description: '"Next bus home", automations like "start tracking when I leave the office".',
        web: { status: 'not-possible' },
        ios: { status: 'planned', note: 'M4' },
      },
      {
        name: 'Apple Watch',
        description: 'Countdown complication and a glance at your usual bus.',
        web: { status: 'not-possible' },
        ios: { status: 'later' },
      },
    ],
  },
  {
    title: 'Account & sync',
    features: [
      {
        name: 'Sign in',
        description: 'Sign in with Apple, a passkey or an email link. Optional: everything keeps working without an account.',
        web: { status: 'planned', note: 'A1' },
        ios: { status: 'planned', note: 'A1' },
      },
      {
        name: 'Sync across devices',
        description: 'Journeys, usual buses and reminder settings shared between the web app and the iOS app.',
        web: { status: 'planned', note: 'A2' },
        ios: { status: 'planned', note: 'A2' },
      },
      {
        name: 'Export & delete your data',
        description: 'Download everything stored about you, or delete your account.',
        web: { status: 'planned', note: 'A2' },
        ios: { status: 'planned', note: 'A2' },
      },
    ],
  },
  {
    title: 'App',
    features: [
      {
        name: 'Install as an app',
        description: 'Add to Home Screen (web) or install from the App Store.',
        web: { status: 'live', note: 'PWA' },
        ios: { status: 'planned', note: 'TestFlight M4' },
      },
      {
        name: 'Dark mode',
        description: 'Follows your system setting.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Works offline',
        description: 'Countdowns keep running from the last update when you lose signal.',
        web: { status: 'live' },
        ios: { status: 'planned', note: 'M0' },
      },
      {
        name: 'Slovenian language',
        description: 'Slovenian interface alongside English.',
        web: { status: 'later' },
        ios: { status: 'later' },
      },
    ],
  },
];
