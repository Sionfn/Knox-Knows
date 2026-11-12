import UIKit
import Capacitor
import StoreKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = KnoxBridgeViewController()
        // Behind the app (e.g. at the keyboard's rounded corners) show Knox's background, not black.
        let knoxBackground = UIColor(named: "LaunchBackground") ?? UIColor(red: 1, green: 0.973, blue: 0.941, alpha: 1)
        window?.backgroundColor = knoxBackground
        window?.rootViewController?.view.backgroundColor = knoxBackground
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}


// Knox's App Store bridge: the store country (so the website link only shows
// where Apple allows it), and Knox plans bought in the app with StoreKit 2.
// Every purchase is signed by Apple; the Knox server checks that signature.
@objc(KnoxStorePlugin)
public class KnoxStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KnoxStorePlugin"
    public let jsName = "KnoxStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "storefront", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]
    private var updates: Task<Void, Never>?

    override public func load() {
        // Renewals and purchases finished outside the app (e.g. Ask to Buy).
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified = result {
                    self?.notifyListeners("transaction", data: ["jws": result.jwsRepresentation])
                }
            }
        }
    }

    @objc func storefront(_ call: CAPPluginCall) {
        Task {
            let code = await Storefront.current?.countryCode ?? ""
            call.resolve(["countryCode": code])
        }
    }

    @objc func products(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                var list: [[String: Any]] = []
                for product in try await Product.products(for: ids) {
                    var item: [String: Any] = ["id": product.id, "displayName": product.displayName, "displayPrice": product.displayPrice]
                    if let sub = product.subscription {
                        item["period"] = sub.subscriptionPeriod.unit == .year ? "year" : "month"
                        if let intro = sub.introductoryOffer, intro.paymentMode == .freeTrial {
                            let unit = intro.period.unit
                            item["trialDays"] = intro.period.value * (unit == .day ? 1 : unit == .week ? 7 : unit == .month ? 30 : 365)
                            item["trialEligible"] = await sub.isEligibleForIntroOffer
                        }
                    }
                    list.append(item)
                }
                call.resolve(["products": list])
            } catch {
                call.reject("Could not load App Store prices.")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing plan."); return }
        guard let value = call.getString("accountToken"), let token = UUID(uuidString: value) else {
            call.reject("Sign in to your Knox account before subscribing.")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else { call.reject("That plan isn't available right now."); return }
                let result = try await product.purchase(options: [.appAccountToken(token)])
                switch result {
                case .success(let verification):
                    if case .verified = verification {
                        call.resolve(["status": "purchased", "jws": verification.jwsRepresentation])
                    } else {
                        call.reject("The App Store couldn't confirm this purchase.")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        let sync = call.getBool("sync") ?? false
        Task {
            do {
                if sync { try await AppStore.sync() }
                var receipts: [UInt64: String] = [:]
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result { receipts[transaction.id] = result.jwsRepresentation }
                }
                for await result in Transaction.unfinished {
                    if case .verified(let transaction) = result { receipts[transaction.id] = result.jwsRepresentation }
                }
                call.resolve(["transactions": Array(receipts.values)])
            } catch {
                call.reject("Could not restore purchases from the App Store. Try again.")
            }
        }
    }

    // Finish only transactions whose receipt the Knox server accepted and saved.
    @objc func finish(_ call: CAPPluginCall) {
        let ids = Set((call.getArray("transactionIds", String.self) ?? []).compactMap { UInt64($0) })
        Task {
            for await result in Transaction.unfinished {
                if case .verified(let transaction) = result, ids.contains(transaction.id) {
                    await transaction.finish()
                }
            }
            call.resolve()
        }
    }

    @objc func manage(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("Subscription settings are unavailable right now.")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("Could not open subscription settings. Open Subscriptions in the App Store.")
            }
        }
    }
}

@objc(KnoxDevicePlugin)
public class KnoxDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KnoxDevicePlugin"
    public let jsName = "KnoxDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    @objc func openSettings(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let url = URL(string: UIApplication.openSettingsURLString),
                  await UIApplication.shared.open(url) else {
                call.reject("Open Settings and select Knox Knows.")
                return
            }
            call.resolve()
        }
    }
}

class KnoxBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KnoxStorePlugin())
        bridge?.registerPluginInstance(KnoxDevicePlugin())
    }
}
