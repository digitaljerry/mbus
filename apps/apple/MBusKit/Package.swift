// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "MBusKit",
  defaultLocalization: "en",
  platforms: [.iOS(.v26), .watchOS(.v26), .macOS(.v26)],
  products: [
    .library(name: "MBusKit", targets: ["MBusKit"]),
    .library(name: "MBusUI", targets: ["MBusUI"]),
  ],
  targets: [
    .target(name: "MBusKit"),
    .target(name: "MBusUI", dependencies: ["MBusKit"]),
    .testTarget(name: "MBusKitTests", dependencies: ["MBusKit"]),
  ]
)
