# Smooth bus motion on the map

Status: plan, not started.

## Goal

On the map, buses should drive along the road continuously instead of
jumping every ten seconds. Between live updates a bus keeps moving at the
speed it has been driving. When a new live position arrives, the bus speeds
up (or eases off) to reach it, and it never drives backwards.

## What the data gives us today

Measured on 10 November 2026 against the running API:

- **Feed rate.** Marprom's live feed refreshes every 10–11 s. The client polls
  `/api/vehicles` every 10 s, and the server caches it for 10 s, so a position
  shown on screen can be up to about 20 s old.
- **Step size.** Between two updates a moving bus jumps 30–230 m (about
  10–80 km/h). Today the marker glides there in a straight line over 1.2 s,
  then sits still for about 9 s, which is the jumpy look we want to fix.
- **What's missing from Marprom.** There is no trip ID and no heading. All
  buses share one feed timestamp (`at`), not a per-bus fix time. We get
  `LineId`, `RouteId` (direction), `NextStopPointId` and the fleet number.
  Today the heading is worked out on the server from the last two positions.
- **Road shapes.** These are already shipped. `network.json` has every line
  variant with its ordered stops and a road shape, simplified to about 8 m.
  That is close enough to follow the road.
- **Matching works.** In a 30-bus sample, 26 matched a variant by line and
  headsign, and 22 were within 15 m of their variant's shape. The other 8
  were 300 m to 2.7 km away from any variant of their line. Those are
  probably driving to or from the depot, on a detour, or on a variant we
  don't have. They keep today's behaviour.

## Approach

Each bus is animated as a **distance along its route shape** (metres from
the first stop), not as a latitude/longitude. Moving along the shape keeps
the bus on the road, gives it a real heading from the road itself, and makes
"speed up to the new position" a one-dimensional problem.

### 1. Server: put each live bus on its route (`apps/web`)

Matching happens once, on the server, so the iOS app gets the same answer
(see AGENTS.md: clients only talk to the MBus API).

- **Stop positions along the shape.** `build-network.mjs` adds `length` (m)
  and `stopAlong: number[]` (each stop's distance along the shape) to every
  variant.
- **Matching module.** A new `lib/routeMatch.ts`. For a live position:
  1. Take the candidate variants. Prefer the ones whose headsign matches
     Marprom's `RouteId` → `HeadsignName`; otherwise use every variant of
     the line.
  2. Project the position onto each candidate's shape.
  3. Keep only projections that are *before* `NextStopPointId`'s
     `stopAlong` and after the previous stop's. This settles loops and
     roads used in both directions, without keeping state between requests
     (Vercel instances don't keep memory reliably).
  4. Pick the closest. If it is more than 40 m off the shape, the bus counts
     as off-route.
- **New vehicle fields.** `/api/vehicles` adds three optional fields to each
  vehicle:
  - `variant`: `"G6/0"`, the line plus the variant's index in
    `network.json`.
  - `along`: distance along the shape, in metres.
  - `offRoute: true` when there is no good match.

  Existing clients ignore the new fields. The web types and MBusKit
  `Vehicle` get them in the same change.
- **Shapes for the client.** The client gets the shapes from
  `/api/network`, which already exists and is cached. Add a light
  `?route=G6,P18` filter so a journey only downloads its own lines.

### 2. Web: a motion model in `lib/busMotion.ts` (pure, unit-tested)

**Shape index.** From each shape, compute the running distance at every
point. `pointAt(s)` then finds the position by binary search and
interpolation, and `bearingAt(s)` gives the heading from the road segment.

**Per bus, keep:**
- the last two fixes `(t, along)`
- the estimated speed `v` (m/s)
- the displayed position `s`

**When a fix arrives:**
- Measured speed is `(along₂ − along₁) / (t₂ − t₁)`. Smooth it with
  `v = 0.5·v + 0.5·measured` and clamp it to 0–20 m/s (72 km/h).
- If the bus moved less than 5 m, it is stopped (at a stop or a light), so
  set `v = 0`.

**Predicted position:**

```
target(t) = along + v·(t − t_fix)
```

The prediction is capped in two ways:
- At the next stop's `stopAlong`. Buses usually stop there, so the marker
  waits at the stop instead of driving past it. If the bus doesn't stop,
  the next fix pulls the marker forward.
- At about 15 s of extrapolation. After that the marker stops moving on its
  own.

**Each frame** (one `requestAnimationFrame` loop for all buses):
- `error = target(now) − s`
- `speed = max(0, v + k·error)` with `k ≈ 0.5 /s`. A bus that is behind
  speeds up; a bus that is ahead slows down and waits. It never reverses.
- **Snap** when `error < −150 m` (the prediction was wrong, or the GPS
  reset) or `error > 800 m` (missed updates).
- If the bus has a large lead (`error > 300 m`), catch up within about 1.5 s.
- Then set `marker.setLngLat(pointAt(s))` and rotate the arrow to
  `bearingAt(s)`, smoothing the turn so it doesn't flip at corners.

**Fallbacks:**
- **No `variant`, or `offRoute`:** keep today's straight 1.2 s glide.
- **Feed older than 45 s:** stop extrapolating and show the bus as stale,
  the same as the existing "position N s old" logic.
- **`prefers-reduced-motion`:** jump to each fix, no extrapolation.
- **Performance:** the loop runs only while the map is visible, at 30 fps or
  less, and pauses when `document.hidden`.

### 3. Map integration (`LiveMap.tsx`)

- **Animation loop.** Replace the per-marker 1.2 s glide with the shared
  loop above. About 30 DOM markers updated per frame is fine; if it isn't,
  move buses to a GeoJSON symbol layer and update it once per frame.
- **Heading.** Take it from the road (`bearingAt`). The server's
  `headingFor` guess becomes the fallback only.
- **Popups.** A popup follows the animated position, not the raw fix.
- **Dev overlay.** With `?debug=motion` in development, show each raw fix as
  a small ghost dot next to the animated bus. This is how the model gets
  tuned.

### 4. Tuning with recorded data

- **Recorder.** A dev script records the live feed (raw Marprom plus our
  matched output) to `scripts/recordings/*.jsonl` for 30–60 minutes at a
  busy time.
- **Replay.** A dev-only `/api/dev/vehicles-replay?file=…&at=` replays a
  recording, in the same spirit as the existing `&at=` time simulation. The
  map can then play back real traffic, including rush hour, at any time of
  day.
- **Tests.** Vitest unit tests for `busMotion.ts` on recorded tracks:
  - a bus never moves backwards
  - error at fix time stays under X m
  - no snaps in normal traffic

  This is also the moment to add Vitest, which AGENTS.md already calls for
  when complex logic arrives.

### 5. iOS (later)

Port `busMotion` to MBusKit as `BusMotion.swift`, with Swift Testing tests
that share the recorded tracks as fixtures. The map view then drives it from
a `TimelineView`/display link. The server side needs no changes for iOS.

## Open questions

1. **`RouteId` → variant mapping.** Is it reliable for short-turn and school
   variants, or do we need a small override table? Check this against a
   recording.
2. **Projecting at a terminus.** At a terminus a bus sits at the end of one
   variant and the start of the next. Treat it as stopped until its
   `RouteId` changes.
3. **ETAs from the animated position.** Should the countdown ("arrives in 3
   min") also use it? Not in this plan; positions stay a map-only effect so
   the times keep coming from the server.

## Order of work

1. Add `stopAlong` and `length` in `build-network.mjs`, then write
   `routeMatch.ts`, the new `/api/vehicles` fields and the MBusKit model
   fields.
2. Write `busMotion.ts` with tests, and hook it into `LiveMap` behind
   `?motion=1`.
3. Build the recorder and replay, and tune the constants.
4. Make it the default on web.
5. Port to iOS.
