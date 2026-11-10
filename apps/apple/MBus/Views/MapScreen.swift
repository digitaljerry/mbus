import MapKit
import MBusKit
import MBusUI
import SwiftUI

/// Live buses for the selected journey's lines, its stops, and a tapped bus's route.
struct MapScreen: View {
  @Environment(AppModel.self) private var model
  @Environment(AppStore.self) private var store
  @Environment(StopsCatalog.self) private var catalog
  @State private var vehicles: [Vehicle] = []
  @State private var selection: String?
  @State private var shape: [CLLocationCoordinate2D] = []
  @State private var position: MapCameraPosition = .region(MKCoordinateRegion(
    center: CLLocationCoordinate2D(latitude: 46.5547, longitude: 15.6459), span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06)))
  @State private var error: String?

  private var routes: [String] { Array(Set(store.selectedJourney?.stops.map(\.route) ?? [])).sorted() }
  private var journeyStops: [Stop] {
    Array(Set(store.selectedJourney?.stops.flatMap { [$0.stopId] + ($0.toStopId.map { [$0] } ?? []) } ?? []))
      .compactMap { catalog.byId[$0] }
  }
  private var selectedVehicle: Vehicle? { vehicles.first { $0.id == selection } }

  var body: some View {
    NavigationStack {
      Map(position: $position, selection: $selection) {
        UserAnnotation()
        if !shape.isEmpty {
          MapPolyline(coordinates: shape)
            .stroke((selectedVehicle.map { Color.line($0.route, $0.color) } ?? Color(hex: RouteColors.fallback)), style: StrokeStyle(lineWidth: 5, lineCap: .round, lineJoin: .round))
        }
        ForEach(journeyStops) { stop in
          Marker(stop.name, systemImage: "signpost.right.fill", coordinate: CLLocationCoordinate2D(latitude: stop.lat, longitude: stop.lon))
            .tint(Color.accentColor)
            .tag("stop:\(stop.id)")
        }
        ForEach(vehicles) { v in
          Annotation(v.headsign ?? v.route, coordinate: CLLocationCoordinate2D(latitude: v.lat, longitude: v.lon), anchor: .center) {
            BusMarker(vehicle: v, selected: v.id == selection)
          }
          .tag(v.id)
          .annotationTitles(.hidden)
        }
      }
      .mapStyle(.standard(pointsOfInterest: .excludingAll, showsTraffic: false))
      .mapControls {
        MapUserLocationButton()
        MapCompass()
        MapScaleView()
      }
      .safeAreaInset(edge: .bottom) {
        if let v = selectedVehicle {
          VehicleCard(vehicle: v).padding()
        } else if let error {
          Text(error).font(.footnote).mbusCard().padding()
        }
      }
      .navigationTitle(routes.isEmpty ? "Map" : routes.joined(separator: " · "))
      .navigationBarTitleDisplayMode(.inline)
      .task(id: routes) { await poll() }
      .task(id: selection) { await loadShape() }
      .task { await catalog.loadIfNeeded() }
    }
  }

  private func poll() async {
    while !Task.isCancelled {
      do {
        vehicles = try await model.api.vehicles(routes: routes)
        error = vehicles.isEmpty ? "No \(routes.joined(separator: "/")) buses are reporting their position right now." : nil
      } catch {
        self.error = "Live positions unavailable."
      }
      try? await Task.sleep(for: .seconds(10))
    }
  }

  private func loadShape() async {
    guard let trip = selectedVehicle?.tripId, let g = try? await model.api.geometry(trip: trip) else {
      shape = []
      return
    }
    shape = g.coordinates.compactMap { $0.count >= 2 ? CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) : nil }
  }
}

struct BusMarker: View {
  var vehicle: Vehicle
  var selected: Bool

  var body: some View {
    ZStack {
      if let h = vehicle.heading {
        Image(systemName: "location.north.fill")
          .font(.system(size: 10))
          .foregroundStyle(Color.line(vehicle.route, vehicle.color))
          .offset(y: -18)
          .rotationEffect(.degrees(h))
      }
      Text(vehicle.route)
        .font(.caption2.weight(.heavy))
        .foregroundStyle(RouteColors.prefersDarkText(RouteColors.hex(for: vehicle.route, other: vehicle.color)) ? .black : .white)
        .padding(.horizontal, 6).padding(.vertical, 4)
        .background(Color.line(vehicle.route, vehicle.color), in: Capsule())
        .overlay(Capsule().stroke(.white, lineWidth: 2))
        .scaleEffect(selected ? 1.3 : 1)
        .shadow(radius: 2)
    }
    .animation(.snappy, value: selected)
  }
}

struct VehicleCard: View {
  var vehicle: Vehicle

  var body: some View {
    HStack(spacing: 12) {
      RouteBadge(vehicle.route, color: vehicle.color)
      VStack(alignment: .leading, spacing: 2) {
        Text(vehicle.headsign ?? "Line \(vehicle.route)").font(.headline).lineLimit(1)
        if let next = vehicle.nextStop { Text("Next: \(next)").font(.subheadline).foregroundStyle(.secondary) }
        Text("Position \(Date(timeIntervalSince1970: vehicle.timestamp / 1000), style: .relative) ago")
          .font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
    }
    .mbusCard()
  }
}
