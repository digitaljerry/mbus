import SwiftUI
import MBusKit

extension Color {
  /// `#RRGGBB` → Color.
  public init(hex: String) {
    let c = RouteColors.rgb(hex)
    self.init(red: c.r, green: c.g, blue: c.b)
  }

  /// Marprom red, as in the web app and the icon.
  public static let mbusAccent = Color(hex: "#D71921")

  /// A bus line's own colour (Marprom's palette first).
  public static func line(_ route: String, _ other: String? = nil) -> Color { Color(hex: RouteColors.hex(for: route, other: other)) }
}

/// The coloured line badge ("G6"), same look as the web app.
public struct RouteBadge: View {
  public var route: String
  public var color: String?
  public var size: Size

  public enum Size: Sendable { case small, regular, large }

  public init(_ route: String, color: String? = nil, size: Size = .regular) {
    self.route = route
    self.color = color
    self.size = size
  }

  private var hex: String { RouteColors.hex(for: route, other: color) }

  public var body: some View {
    Text(route)
      .font(font)
      .monospacedDigit()
      .lineLimit(1)
      .minimumScaleFactor(0.7)
      .foregroundStyle(RouteColors.prefersDarkText(hex) ? Color.black.opacity(0.85) : .white)
      .padding(.horizontal, hPad)
      .padding(.vertical, vPad)
      .frame(minWidth: minWidth)
      .background(Color(hex: hex), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
      .accessibilityLabel("Line \(route)")
  }

  private var font: Font {
    switch size {
    case .small: .caption.weight(.bold)
    case .regular: .subheadline.weight(.bold)
    case .large: .title2.weight(.heavy)
    }
  }
  private var hPad: CGFloat { size == .large ? 12 : size == .regular ? 8 : 5 }
  private var vPad: CGFloat { size == .large ? 6 : size == .regular ? 3 : 2 }
  private var minWidth: CGFloat { size == .large ? 64 : size == .regular ? 40 : 28 }
  private var radius: CGFloat { size == .large ? 12 : 7 }
}

/// Live countdown that ticks every second under 10 minutes and every minute otherwise.
public struct CountdownLabel: View {
  public var target: Date
  public var style: Style

  public enum Style: Sendable { case compact, hero }

  public init(_ target: Date, style: Style = .compact) {
    self.target = target
    self.style = style
  }

  public var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { ctx in
      let c = Countdown(to: target, now: ctx.date)
      HStack(alignment: .firstTextBaseline, spacing: 3) {
        Text(c.value)
          .font(style == .hero ? .system(size: 76, weight: .bold, design: .rounded) : .title2.weight(.semibold))
          .monospacedDigit()
          .contentTransition(.numericText(countsDown: true))
        if !c.unit.isEmpty {
          Text(c.unit).font(style == .hero ? .title2 : .subheadline).foregroundStyle(.secondary)
        }
      }
      .foregroundStyle(c.departed ? Color.secondary : c.urgent ? Color.orange : Color.primary)
      .animation(.snappy, value: c.value)
      .accessibilityLabel(c.label)
    }
  }
}

/// "Live", "+3 min", "On time", or "Timetable".
public struct StatusPill: View {
  public var schedule: Schedule

  public init(_ schedule: Schedule) { self.schedule = schedule }

  public var body: some View {
    HStack(spacing: 4) {
      if schedule.isLive {
        Image(systemName: "dot.radiowaves.up.forward")
          .symbolEffect(.variableColor.iterative, options: .repeating)
        Text(delayInfo(schedule.delay)?.text ?? "Live")
      } else {
        Image(systemName: "calendar")
        Text("Timetable")
      }
    }
    .font(.caption2.weight(.semibold))
    .foregroundStyle(tint)
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .background(tint.opacity(0.14), in: Capsule())
  }

  private var tint: Color {
    guard schedule.isLive else { return .secondary }
    switch delayInfo(schedule.delay)?.tone {
    case .late: return .red
    case .warn: return .orange
    default: return .green
    }
  }
}

extension View {
  /// Liquid Glass card background.
  public func mbusCard(tint: Color? = nil, cornerRadius: CGFloat = 22) -> some View {
    padding(14)
      .glassEffect(tint.map { .regular.tint($0.opacity(0.25)) } ?? .regular, in: .rect(cornerRadius: cornerRadius))
  }
}
