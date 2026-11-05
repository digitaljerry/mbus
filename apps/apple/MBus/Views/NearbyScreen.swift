import MapKit
import MBusKit
import MBusUI
import SwiftUI

struct NearbyScreen: View {
  @Environment(AppModel.self) private var model
  @State private var location = LocationProvider()
  @State private var stops: [NearbyStop] = []
  @State private var loading = false
  @State private var error: String?

  var body: some View {
    NavigationStack {
      List {
        if location.denied {
          ContentUnavailableView {
            Label("Location is off", systemImage: "location.slash")
          } description: {
            Text("Allow MBus to use your location in Settings to see stops near you.")
          } actions: {
            Button("Open Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
          }
        } else if stops.isEmpty {
          if loading || location.locating {
            HStack { ProgressView(); Text("Finding stops near you…") }
          } else if let error {
            Text(error).foregroundStyle(.secondary)
          }
        }
        ForEach(stops) { stop in
          Section {
            ForEach(Array(stop.departures.prefix(8).enumerated()), id: \.offset) { _, d in
              HStack {
                RouteBadge(d.route ?? "?", color: d.routeColor, size: .small)
                Text(d.destination ?? "").lineLimit(1).font(.subheadline)
                Spacer()
                if d.isLive { Image(systemName: "dot.radiowaves.up.forward").font(.caption).foregroundStyle(.green) }
                CountdownLabel(d.date).font(.subheadline)
              }
            }
          } header: {
            HStack {
              Text(stop.stopName ?? "Stop \(stop.stop)")
              Spacer()
              Button {
                walk(to: stop)
              } label: {
                Label("\(stop.walkMinutes) min", systemImage: "figure.walk")
              }
              .font(.caption.weight(.semibold))
              .buttonStyle(.glass)
            }
          } footer: {
            Text("\(Int(stop.distance)) m away")
          }
        }
      }
      .navigationTitle("Nearby")
      .refreshable { await load() }
      .task { await load() }
    }
  }

  private func load() async {
    loading = true
    defer { loading = false }
    await location.locate()
    guard let loc = location.location else {
      if !location.denied { error = "Couldn't find your location." }
      return
    }
    do {
      stops = try await model.api.nearby(lat: loc.coordinate.latitude, lon: loc.coordinate.longitude).stops
      error = stops.isEmpty ? "No stops nearby." : nil
    } catch {
      self.error = "Nearby stops are unavailable right now."
    }
  }

  /// Walking directions in Apple Maps.
  private func walk(to stop: NearbyStop) {
    let item = MKMapItem(location: CLLocation(latitude: stop.lat, longitude: stop.lon), address: nil)
    item.name = stop.stopName
    item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
  }
}
