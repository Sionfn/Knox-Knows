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


// The App Store country (e.g. "USA"), so the app only shows the website
// upgrade link where Apple's rules allow it (the US App Store).
@objc(KnoxStorePlugin)
public class KnoxStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KnoxStorePlugin"
    public let jsName = "KnoxStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "storefront", returnType: CAPPluginReturnPromise)
    ]
    @objc func storefront(_ call: CAPPluginCall) {
        Task {
            let code = await Storefront.current?.countryCode ?? ""
            call.resolve(["countryCode": code])
        }
    }
}

class KnoxBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KnoxStorePlugin())
    }
}
