import Foundation
import Testing
@testable import MBusKit

@Suite struct TimeTests {
  @Test func midnightRespectsDST() {
    // 29 Mar 2026: CET → CEST. Midnight is still +01:00.
    let m = LjubljanaTime.midnight("2026-03-29")!
    #expect(m.timeIntervalSince1970 == 1_774_738_800)
    // Usual-bus times are wall-clock times, also on DST days.
    #expect(LjubljanaTime.clock(LjubljanaTime.serviceTime("2026-03-29", hhmm: "10:00")!) == "10:00")
    #expect(LjubljanaTime.clock(LjubljanaTime.serviceTime("2026-10-25", hhmm: "08:00")!) == "08:00")
    // Past midnight rolls over.
    let late = LjubljanaTime.serviceTime("2026-11-04", hhmm: "24:15")!
    #expect(LjubljanaTime.dateString(late) == "2026-11-05" && LjubljanaTime.clock(late) == "00:15")
  }

  @Test func weekdayAndDates() {
    #expect(LjubljanaTime.isoWeekday("2026-11-04") == 3) // Wednesday
    #expect(LjubljanaTime.addDays("2026-12-31", 1) == "2027-01-01")
    #expect(LjubljanaTime.seconds("25:10") == 25 * 3600 + 600)
  }
}

@Suite struct CountdownTests {
  let now = Date(timeIntervalSince1970: 1_800_000_000)

  @Test(arguments: [
    (-31.0, "Gone"), (-5.0, "Now"), (65.0, "1:05"), (599.0, "9:59"), (600.0, "10"), (3_900.0, "1 h 05"),
  ])
  func labels(offset: Double, value: String) {
    #expect(Countdown(to: now.addingTimeInterval(offset), now: now).value == value)
  }

  @Test func delay() {
    #expect(delayInfo(nil) == nil)
    #expect(delayInfo(0)?.text == "On time")
    #expect(delayInfo(-120)?.text == "2 min early")
    #expect(delayInfo(240)?.tone == .late)
  }
}

@Suite struct UsualTests {
  let usual = UsualBus(id: "u1", stopId: "255", stopName: "Pohorska", route: "G6", time: "07:31", days: [1, 2, 3, 4, 5], walkMinutes: 6, remindBefore: 2)

  @Test func occurrences() {
    // Wednesday 4 Nov 2026, 08:00 → next is Thursday 07:31.
    let now = LjubljanaTime.serviceTime("2026-11-04", hhmm: "08:00")!
    let occ = usual.nextOccurrences(from: now).first!
    #expect(occ.date == "2026-11-05")
    #expect(LjubljanaTime.clock(occ.leave) == "07:25")
    #expect(LjubljanaTime.clock(occ.notify) == "07:23")
    // Friday → Monday.
    let fri = LjubljanaTime.serviceTime("2026-11-06", hhmm: "09:00")!
    #expect(usual.nextOccurrences(from: fri).first?.date == "2026-11-09")
  }

  @Test func approachingPhases() {
    let occ = usual.occurrence(on: "2026-11-05")!
    #expect(UsualApproach.phase(of: occ, now: occ.notify.addingTimeInterval(-20 * 60)) == .later)
    #expect(UsualApproach.phase(of: occ, now: occ.notify.addingTimeInterval(-60)) == .soon)
    #expect(UsualApproach.phase(of: occ, now: occ.notify.addingTimeInterval(60)) == .approaching)
    #expect(UsualApproach.phase(of: occ, now: occ.depart.addingTimeInterval(120)) == .departed)
    let current = UsualApproach.current([usual], now: occ.notify.addingTimeInterval(30))
    #expect(current?.2 == .approaching)
  }

  @Test func lateBusStaysApproaching() {
    let occ = usual.occurrence(on: "2026-11-05")!
    let now = occ.depart.addingTimeInterval(3 * 60) // timetabled bus left 3 min ago
    #expect(UsualApproach.current([usual], now: now) == nil)
    // Live data says it's 5 min late: still coming, still today's bus.
    let live = [occ.key: occ.depart.addingTimeInterval(5 * 60)]
    let c = UsualApproach.current([usual], now: now, live: live)
    #expect(c?.1.date == "2026-11-05" && c?.2 == .approaching)
    #expect(UsualApproach.possiblyLate([usual], now: now).first?.1.key == occ.key)
  }

  @Test func remindersNeverRefire() {
    let occ = usual.occurrence(on: "2026-11-05")!
    // Just after the reminder time: today's is not planned again.
    let plan = ReminderPlanner.plan([usual], now: occ.notify.addingTimeInterval(10))
    #expect(!plan.contains { $0.id == "usual:\(occ.key)" })
    // Already delivered (e.g. a delay moved it later): skipped too.
    let later = ReminderPlanner.plan([usual], now: occ.notify.addingTimeInterval(-600), delivered: ["usual:\(occ.key)"])
    #expect(!later.contains { $0.id == "usual:\(occ.key)" })
  }

  @Test func matchesLiveDeparture() {
    let date = "2026-11-05"
    let planned = LjubljanaTime.serviceTime(date, hhmm: "07:31")!
    let live = Schedule(time: "07:34", epoch: (planned.timeIntervalSince1970 + 180) * 1000, scheduledTime: "07:31", delay: 180, realtime: true)
    let other = Schedule(time: "07:01", epoch: (planned.timeIntervalSince1970 - 1800) * 1000, scheduledTime: "07:01")
    #expect(usual.match(in: [other, live], on: date) == live)
  }

  @Test func reminderPlanUsesLiveDelay() {
    let now = LjubljanaTime.serviceTime("2026-11-04", hhmm: "20:00")!
    let base = usual.nextOccurrences(from: now).first!
    let live = Schedule(time: "07:36", epoch: (base.depart.timeIntervalSince1970 + 300) * 1000, scheduledTime: "07:31", delay: 300, realtime: true)
    let plan = ReminderPlanner.plan([usual], now: now, live: [base.key: live])
    #expect(plan.count == 6) // Thu, Fri, Mon, Tue, Wed, Thu
    #expect(LjubljanaTime.clock(plan[0].fireDate) == "07:28")
    #expect(plan[0].body.contains("+5 min"))
    #expect(plan[0].id == "usual:u1@2026-11-05")
  }
}

@Suite struct DecodingTests {
  @Test func scheduleResponse() throws {
    let json = """
    {"stop":"255","stopName":"Pohorska - pošta","route":"G6","routeColor":"#1A6734","date":"2026-11-04",
     "schedules":[{"time":"21:31","scheduledTime":"21:31","epoch":1793824260000,"destination":"Vzpenjača","realtime":false,
     "arrivalEpoch":1793824440000,"arrivalTime":"21:34","arrivalEstimated":false}],
     "url":"https://x","source":"marprom","toStop":"326","limit":4,"earlier":[],"fetchedAt":1793824000000}
    """
    let r = try JSONDecoder().decode(ScheduleResponse.self, from: Data(json.utf8))
    #expect(r.schedules.first?.arrivalTime == "21:34")
    #expect(r.source == .marprom)
    let board = Board.merge([StopRoute(stopId: "255", route: "G6", toStopId: "326"): r])
    #expect(board.upcoming.count == 1)
  }

  @Test func liveSourceAndBusCode() throws {
    let json = """
    {"stop":"461","route":"P17","routeColor":"#000","date":"2026-11-05",
     "schedules":[{"time":"11:53","scheduledTime":"11:50","epoch":1793875980000,"delay":180,"realtime":true,"busCode":"126"}],
     "source":"marprom-live"}
    """
    let r = try JSONDecoder().decode(ScheduleResponse.self, from: Data(json.utf8))
    #expect(r.source == .marpromLive)
    #expect(r.schedules.first?.busCode == "126")
    let future = json.replacingOccurrences(of: "marprom-live", with: "something-new")
    #expect(try JSONDecoder().decode(ScheduleResponse.self, from: Data(future.utf8)).source == ScheduleSource.none)
  }

  @Test func partialStateDecodes() throws {
    let s = try JSONDecoder().decode(AppState.self, from: Data(#"{"usualBuses":[],"settings":{"keepAwake":false}}"#.utf8))
    #expect(s.journeys == Defaults.journeys)
    #expect(s.settings.keepAwake == false && s.settings.autoLiveActivity)
  }

  @Test func stateRoundTrip() throws {
    let s = AppState(usualBuses: [UsualBus(stopId: "1", route: "g6", time: "08:00")])
    let back = try JSONDecoder().decode(AppState.self, from: JSONEncoder().encode(s))
    #expect(back == s)
    #expect(back.usualBuses[0].route == "G6")
  }
}
