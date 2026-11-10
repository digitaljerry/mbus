import MBusKit
import MBusUI
import SwiftUI
import WidgetKit

// Live Activity layouts. In Shared so the app can show them too (debug gallery, previews).

/// Ticks on its own: no app updates needed for the countdown itself.
struct ActivityCountdown: View {
  var target: Date
  init(_ target: Date) { self.target = target }

  var body: some View {
    if target > .now {
      Text(timerInterval: Date.now...target, countsDown: true, showsHours: true)
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
    } else {
      Text("Now")
    }
  }
}

struct StatusText: View {
  var state: BusActivityState

  var body: some View {
    if state.realtime {
      Label(delayInfo(state.delaySeconds)?.text ?? "Live", systemImage: "dot.radiowaves.up.forward")
        .foregroundStyle(delayInfo(state.delaySeconds)?.tone == .late ? .red : delayInfo(state.delaySeconds)?.tone == .warn ? .orange : .green)
    } else {
      Label("Timetable", systemImage: "calendar").foregroundStyle(.secondary)
    }
  }
}

struct LockScreenActivity: View {
  @Environment(\.activityFamily) private var family
  var info: BusActivityInfo
  var state: BusActivityState
  var stale: Bool

  var body: some View {
    if family == .small {
      // Apple Watch Smart Stack / CarPlay.
      VStack(alignment: .leading, spacing: 2) {
        HStack {
          RouteBadge(info.route, color: info.routeColor, size: .small)
          Spacer()
          ActivityCountdown(state.departure).font(.headline)
        }
        Text(info.stopName).font(.caption2).lineLimit(1)
        StatusText(state: state).font(.caption2)
      }
      .padding(8)
    } else {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .center, spacing: 12) {
          RouteBadge(info.route, color: info.routeColor, size: .large)
          VStack(alignment: .leading, spacing: 2) {
            Text(info.destination ?? "Line \(info.route)")
              .font(.subheadline.weight(.semibold))
              .lineLimit(2)
              .minimumScaleFactor(0.85)
            Text("\(LjubljanaTime.clock(state.departure)) · \(info.stopName)")
              .font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
          .layoutPriority(1)
          Spacer(minLength: 0)
          // Timer text takes all the width it's offered, so give it a fixed slot.
          ActivityCountdown(state.departure)
            .font(.system(size: 30, weight: .bold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: 96, alignment: .trailing)
        }
        HStack {
          StatusText(state: state)
          Spacer()
          if let leave = state.leaveBy(walkMinutes: info.walkMinutes), leave > .now {
            Label("Leave by \(LjubljanaTime.clock(leave))", systemImage: "figure.walk").foregroundStyle(.primary)
          } else if let arr = state.arrival {
            Label("\(LjubljanaTime.clock(arr)) at \(info.toStopName ?? "your stop")", systemImage: "flag.checkered").lineLimit(1)
          }
        }
        .font(.caption.weight(.medium))
        if stale {
          Text("Not updated recently").font(.caption2).foregroundStyle(.secondary)
        }
      }
      .padding(16)
    }
  }
}

extension BusActivityInfo {
  static let preview = BusActivityInfo(route: "G6", routeColor: "#1A6734", stopId: "255", stopName: "Pohorska - pošta",
                                       destination: "Vzpenjača - Avtobusna postaja", toStopId: "326", toStopName: "Streliška",
                                       scheduledTime: "07:31", usualId: "u", walkMinutes: 6)
}
