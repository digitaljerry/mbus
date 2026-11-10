import ActivityKit
import AppIntents
import MBusKit
import MBusUI
import SwiftUI
import WidgetKit

/// Lock Screen, Dynamic Island, StandBy, CarPlay and Apple Watch Smart Stack.
struct BusLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BusActivityAttributes.self) { context in
      LockScreenActivity(info: context.attributes.info, state: context.state, stale: context.isStale)
        .activityBackgroundTint(Color.line(context.attributes.info.route, context.attributes.info.routeColor).opacity(0.22))
        .activitySystemActionForegroundColor(.primary)
        .widgetURL(URL(string: "mbus://usual"))
    } dynamicIsland: { context in
      let info = context.attributes.info
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 4) {
            RouteBadge(info.route, color: info.routeColor)
            Text(info.stopName).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          ActivityCountdown(state.departure)
            .font(.title2.weight(.semibold))
            .frame(maxWidth: 90, alignment: .trailing)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(info.destination ?? "Line \(info.route)").font(.subheadline.weight(.semibold)).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            StatusText(state: state)
            Spacer()
            if let leave = state.leaveBy(walkMinutes: info.walkMinutes), leave > .now {
              Label("Leave \(LjubljanaTime.clock(leave))", systemImage: "figure.walk")
            } else if let arr = state.arrival {
              Label("\(LjubljanaTime.clock(arr)) at \(info.toStopName ?? "stop")", systemImage: "flag.checkered").lineLimit(1)
            }
            Button(intent: StopTrackingIntent()) { Image(systemName: "xmark") }
              .buttonStyle(.plain)
              .accessibilityLabel("Stop tracking")
          }
          .font(.caption)
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        RouteBadge(info.route, color: info.routeColor, size: .small)
      } compactTrailing: {
        ActivityCountdown(state.departure)
          .font(.caption.weight(.semibold))
          .frame(maxWidth: 46)
      } minimal: {
        Text(info.route)
          .font(.caption2.weight(.heavy))
          .foregroundStyle(Color.line(info.route, info.routeColor))
      }
      .keylineTint(Color.line(info.route, info.routeColor))
      .widgetURL(URL(string: "mbus://usual"))
    }
    .supplementalActivityFamilies([.small, .medium])
  }
}

#Preview("Lock Screen", as: .content, using: BusActivityAttributes(info: .preview)) {
  BusLiveActivity()
} contentStates: {
  BusActivityState(departure: .now.addingTimeInterval(7 * 60), arrival: .now.addingTimeInterval(11 * 60), delaySeconds: 120, realtime: true)
  BusActivityState(departure: .now.addingTimeInterval(25 * 60))
}

#Preview("Island", as: .dynamicIsland(.expanded), using: BusActivityAttributes(info: .preview)) {
  BusLiveActivity()
} contentStates: {
  BusActivityState(departure: .now.addingTimeInterval(7 * 60), delaySeconds: 120, realtime: true)
}

