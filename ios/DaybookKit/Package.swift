// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DaybookKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "DaybookKit", targets: ["DaybookKit"]),
    ],
    targets: [
        .target(name: "DaybookKit"),
        .testTarget(
            name: "DaybookKitTests",
            dependencies: ["DaybookKit"],
            resources: [.copy("Fixtures")]
        ),
    ],
    swiftLanguageModes: [.v6]
)
