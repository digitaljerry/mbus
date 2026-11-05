import MBusKit
import MBusUI
import SwiftUI

struct RootView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    @Bindable var model = model
    TabView(selection: $model.selectedTab) {
      Tab("Departures", systemImage: "bus.fill", value: AppTab.departures) {
        BoardScreen()
      }
      Tab("Map", systemImage: "map.fill", value: AppTab.map) {
        MapScreen()
      }
      Tab("Nearby", systemImage: "location.fill", value: AppTab.nearby) {
        NearbyScreen()
      }
      Tab("Usual", systemImage: "star.fill", value: AppTab.usual) {
        UsualScreen()
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    .tabBarMinimizeBehavior(.onScrollDown)
    .modifier(ApproachingAccessoryModifier(approaching: model.approaching))
    .sheet(item: $model.presentedDeparture) { d in
      DeparturePager(start: d, departures: model.siblings(of: d))
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
    .sheet(item: $model.editingUsual) { u in
      NavigationStack { UsualEditor(usual: u) }
    }
  }
}

/// Mini player above the tab bar while a usual bus is due.
struct ApproachingAccessory: View {
  @Environment(AppModel.self) private var model
  @Environment(\.tabViewBottomAccessoryPlacement) private var placement
  var approaching: AppModel.Approaching

  var body: some View {
    HStack(spacing: 10) {
      RouteBadge(approaching.usual.route, color: approaching.usual.routeColor, size: .small)
      VStack(alignment: .leading, spacing: 0) {
        Text(approaching.phase == .approaching ? "Time to go" : "Your usual bus")
          .font(.caption2).foregroundStyle(.secondary)
        if placement != .inline {
          Text("Leave by \(LjubljanaTime.clock(approaching.leaveBy))").font(.subheadline.weight(.semibold))
        }
      }
      Spacer(minLength: 4)
      Text(timerInterval: Date.now...max(approaching.departure, .now), countsDown: true)
        .font(.subheadline.weight(.semibold)).monospacedDigit()
        .frame(maxWidth: 64, alignment: .trailing)
      Button {
        Task { await model.trackApproaching() }
      } label: {
        Image(systemName: "dot.radiowaves.left.and.right")
      }
      .accessibilityLabel("Track on Lock Screen")
    }
    .padding(.horizontal, 14)
    .contentShape(.rect)
    .onTapGesture { model.selectedTab = .usual }
  }
}

/// The accessory only appears while a usual bus is due (needs iOS 26.1; the board card covers 26.0).
struct ApproachingAccessoryModifier: ViewModifier {
  var approaching: AppModel.Approaching?

  func body(content: Content) -> some View {
    if #available(iOS 26.1, *) {
      content.tabViewBottomAccessory(isEnabled: approaching != nil) {
        if let approaching { ApproachingAccessory(approaching: approaching) }
      }
    } else {
      content
    }
  }
}
