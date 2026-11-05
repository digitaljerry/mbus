import Foundation

/// Countdown labels, same rules as apps/web/src/app/lib/format.ts.
public struct Countdown: Equatable, Sendable {
  public var value: String
  public var unit: String
  public var label: String
  public var urgent: Bool
  public var departed: Bool

  public static let secondsThreshold: TimeInterval = 10 * 60

  public init(to target: Date, now: Date = .now) {
    let diff = target.timeIntervalSince(now)
    if diff <= -30 {
      self.init(value: "Gone", unit: "", label: "departed", urgent: false, departed: true)
    } else if diff <= 0 {
      self.init(value: "Now", unit: "", label: "departing now", urgent: true, departed: false)
    } else if diff < Self.secondsThreshold {
      let total = Int(diff.rounded(.up))
      let m = total / 60, s = total % 60
      self.init(value: String(format: "%d:%02d", m, s), unit: "",
                label: m > 0 ? "in \(m) min \(s) s" : "in \(s) s", urgent: diff <= 180, departed: false)
    } else {
      let mins = Int(diff / 60)
      if mins < 60 {
        self.init(value: "\(mins)", unit: "min", label: "in \(mins) min", urgent: false, departed: false)
      } else {
        let h = mins / 60, m = mins % 60
        self.init(value: String(format: "%d h %02d", h, m), unit: "", label: "in \(h) h \(m) min", urgent: false, departed: false)
      }
    }
  }

  private init(value: String, unit: String, label: String, urgent: Bool, departed: Bool) {
    self.value = value
    self.unit = unit
    self.label = label
    self.urgent = urgent
    self.departed = departed
  }
}

public enum DelayTone: Sendable { case ok, warn, late }

public func delayInfo(_ seconds: Int?) -> (text: String, tone: DelayTone)? {
  guard let seconds else { return nil }
  let mins = Int((Double(seconds) / 60).rounded())
  if mins <= 0 { return (mins < 0 ? "\(-mins) min early" : "On time", .ok) }
  return ("+\(mins) min", mins <= 3 ? .warn : .late)
}

/// "Tomorrow" / weekday when a departure isn't today (Ljubljana).
public func dayLabel(_ date: Date, now: Date = .now) -> String? {
  let d = LjubljanaTime.dateString(date)
  if d == LjubljanaTime.dateString(now) { return nil }
  if d == LjubljanaTime.dateString(now.addingTimeInterval(86_400)) { return "Tomorrow" }
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_GB")
  f.timeZone = LjubljanaTime.timeZone
  f.dateFormat = "EEE"
  return f.string(from: date)
}

public enum RouteColors {
  /// Official Marprom line colours, as on marprom.si (Vozni redi). They win over
  /// the GTFS colours the API passes through, which are wrong for some lines.
  public static let table: [String: String] = [
    "G1": "#323033", "G2": "#88A1A9", "G3": "#6F3A96", "G4": "#1C3564", "G5": "#DA1F27", "G6": "#1A6734",
    "P7": "#8A181A", "P8": "#8EB3DF", "P9": "#E5861D", "P10": "#7BC258", "P11": "#D5DA76", "P12": "#1480C1",
    "P13": "#8C7174", "P14": "#F7B1CA", "P15": "#60C3AC", "P16": "#D5137B", "P17": "#9C8AC1", "P18": "#C07E65",
    "P19": "#F5DD26",
  ]
  public static let fallback = "#475569"

  /// A line's colour: Marprom's own, else `other` (from the API), else slate.
  public static func hex(for route: String, other: String? = nil) -> String { table[route.uppercased()] ?? other ?? fallback }

  /// Lines offered in the journey editor.
  public static let knownRoutes = ["G1", "G2", "G3", "G4", "G5", "G6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19"]

  /// RGB components 0…1 for a #RRGGBB string.
  public static func rgb(_ hex: String) -> (r: Double, g: Double, b: Double) {
    let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return (0.28, 0.33, 0.41) }
    return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
  }

  /// Whether dark text reads better than white on this background.
  public static func prefersDarkText(_ hex: String) -> Bool {
    let c = rgb(hex)
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.62
  }
}

public enum Defaults {
  /// Journeys shown on first run (apps/web/src/app/lib/defaults.ts).
  public static let journeys: [Journey] = [
    Journey(id: "home-to-city", name: "🏠 Home → 🏙️ City", stops: [.init(stopId: "255", route: "G6", toStopId: "358")], description: "Pohorska – pošta"),
    Journey(id: "home-to-school", name: "🏠 Home → 🏫 School", stops: [.init(stopId: "255", route: "G6", toStopId: "326")], description: "Pohorska – pošta"),
    Journey(id: "home-to-office", name: "🏠 Home → 🏢 Office", stops: [.init(stopId: "255", route: "G6", toStopId: "191")], description: "Pohorska – pošta"),
    Journey(id: "city-to-home", name: "🏙️ City → 🏠 Home",
            stops: [.init(stopId: "359", route: "G6", toStopId: "256"), .init(stopId: "359", route: "P18", toStopId: "150")], description: "City – zdravstveni dom"),
    Journey(id: "office-to-home", name: "🏢 Office → 🏠 Home",
            stops: [.init(stopId: "347", route: "G6", toStopId: "256"), .init(stopId: "347", route: "P18", toStopId: "150")], description: "UKC – Tabor"),
    Journey(id: "school-to-city", name: "🏫 School → 🏙️ City",
            stops: [.init(stopId: "326", route: "G6", toStopId: "358"), .init(stopId: "243", route: "P18", toStopId: "358")], description: "Streliška / OŠ Ludvika Pliberška"),
    Journey(id: "school-to-home", name: "🏫 School → 🏠 Home",
            stops: [.init(stopId: "327", route: "G6", toStopId: "256"), .init(stopId: "242", route: "P18", toStopId: "150")], description: "Streliška / OŠ Ludvika Pliberška"),
  ]
}
