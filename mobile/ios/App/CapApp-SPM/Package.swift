// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v17)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(name: "CapacitorFirebaseAuthentication", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor-firebase/authentication"),
        .package(name: "CapacitorStatusBar", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/status-bar"),
        .package(name: "CapacitorApp", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/app"),
        .package(name: "CapacitorBrowser", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/browser"),
        .package(name: "CapacitorCamera", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/camera"),
        .package(name: "CapacitorFilesystem", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorHaptics", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorNetwork", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/network"),
        .package(name: "CapacitorShare", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/share"),
        .package(name: "CapacitorSplashScreen", path: "../../../../../knox-mobile-polish-oct31/mobile/node_modules/@capacitor/splash-screen")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseAuthentication", package: "CapacitorFirebaseAuthentication"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorBrowser", package: "CapacitorBrowser"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen")
            ]
        )
    ]
)
