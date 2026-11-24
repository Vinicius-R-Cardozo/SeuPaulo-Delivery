import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        TripLocation.shared.restore()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        AppPush.token = deviceToken.map { String(format: "%02x", $0) }.joined()
        AppPush.changed()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler complete: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard notification.request.content.userInfo["appPush"] != nil, AppPush.enabled else { complete([]); return }
        if #available(iOS 14.0, *) { complete([.banner, .list, .sound]) }
        else { complete([.alert, .sound]) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler complete: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if info["appPush"] != nil, let route = info["route"] as? String {
            DispatchQueue.main.async {
                AppPush.route = route
                AppPush.changed()
            }
        }
        complete()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if url.scheme == "seupaulo", url.host == "pedido", let id = UUID(uuidString: url.lastPathComponent) {
            OrderLive.opened = id.uuidString.lowercased()
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

@objc(AppPush)
public final class AppPush: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppPush"
    public let jsName = "AppPush"
    public let pluginMethods: [CAPPluginMethod] = ["state", "enable", "clear"].compactMap { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private static weak var instance: AppPush?
    static var token: String?
    static var route: String?
    static var enabled = false

    override public func load() { Self.instance = self }

    static func changed() {
        Self.instance?.notifyListeners("pushChanged", data: [:])
    }

    @objc func state(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            if settings.authorizationStatus == .notDetermined {
                center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                    self.report(call, allowed: granted)
                }
            } else {
                self.report(call, allowed: settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional)
            }
        }
    }

    private func report(_ call: CAPPluginCall, allowed: Bool) {
        DispatchQueue.main.async {
            if allowed && Self.token == nil { UIApplication.shared.registerForRemoteNotifications() }
            let sandbox = Bundle.main.object(forInfoDictionaryKey: "OrderPushEnvironment") as? String == "development"
            var result: PluginCallResultData = ["platform": sandbox ? "ios-sandbox" : "ios"]
            if allowed, let token = Self.token { result["token"] = token }
            if let route = Self.route { result["route"] = route; Self.route = nil }
            call.resolve(result)
        }
    }

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { Self.enabled = call.getBool("enabled") == true; call.resolve() }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            Self.enabled = false
            Self.route = nil
            let center = UNUserNotificationCenter.current()
            center.getDeliveredNotifications { notes in
                center.removeDeliveredNotifications(withIdentifiers: notes.filter {
                    $0.request.content.userInfo["appPush"] != nil
                }.map { $0.request.identifier })
                call.resolve()
            }
        }
    }
}
