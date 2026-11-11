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
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]
    private var updates: Task<Void, Never>?

    override public func load() {
        // Renewals and purchases finished outside the app (e.g. Ask to Buy).
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
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
        let token = call.getString("accountToken").flatMap { UUID(uuidString: $0) }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else { call.reject("That plan isn't available right now."); return }
                let result = try await product.purchase(options: token.map { [.appAccountToken($0)] } ?? [])
                switch result {
                case .success(let verification):
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
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
            if sync { try? await AppStore.sync() } // "Restore purchases"
            var list: [String] = []
            for await result in Transaction.currentEntitlements {
                if case .verified = result { list.append(result.jwsRepresentation) }
            }
            call.resolve(["transactions": list])
        }
    }

    @objc func manage(_ call: CAPPluginCall) {
        Task { @MainActor in
            if let scene = self.bridge?.viewController?.view.window?.windowScene {
                try? await AppStore.showManageSubscriptions(in: scene)
            }
            call.resolve()
        }
    }
}

class KnoxBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KnoxStorePlugin())
    }
}
