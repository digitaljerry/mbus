#if DEBUG
import MBusKit
import MBusUI
import SwiftUI

/// Launch with `-MBusGallery` to see the Live Activity layouts inside the app
/// (handy for screenshots on a simulator, where the Lock Screen is hard to reach).
struct DebugGallery: View {
  static var isEnabled: Bool { ProcessInfo.processInfo.arguments.contains("-MBusGallery") }

  private let live = BusActivityState(departure: .now.addingTimeInterval(7 * 60 + 12), arrival: .now.addingTimeInterval(11 * 60),
                                      delaySeconds: 120, realtime: true)
  private let timetable = BusActivityState(departure: .now.addingTimeInterval(24 * 60), arrival: .now.addingTimeInterval(40 * 60))

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        Text("Live Activity").font(.largeTitle.bold())
        caption("Lock Screen · live, 2 min late")
        LockScreenActivity(info: .preview, state: live, stale: false)
          .background(Color(hex: BusActivityInfo.preview.routeColor).opacity(0.22), in: .rect(cornerRadius: 24))
        caption("Lock Screen · timetable")
        LockScreenActivity(info: .preview, state: timetable, stale: false)
          .background(Color(hex: BusActivityInfo.preview.routeColor).opacity(0.22), in: .rect(cornerRadius: 24))
        caption("Dynamic Island · compact")
        HStack {
          RouteBadge("G6", color: "#1A6734", size: .small)
          Spacer()
          ActivityCountdown(live.departure).font(.caption.weight(.semibold)).frame(maxWidth: 46).foregroundStyle(.white)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .frame(width: 250)
        .background(.black, in: Capsule())
        .frame(maxWidth: .infinity)
      }
      .padding()
    }
    .background(LinearGradient(colors: [.indigo.opacity(0.6), .teal.opacity(0.5)], startPoint: .top, endPoint: .bottom))
  }

  private func caption(_ s: String) -> some View { Text(s).font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
}
#endif
