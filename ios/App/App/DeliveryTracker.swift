import Capacitor
import CoreLocation
import UIKit

final class DeliveryViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        overrideUserInterfaceStyle = .dark
        if #available(iOS 15.0, *), let webView {
            webView.underPageBackgroundColor = webView.backgroundColor
        }
        bridge?.registerPluginInstance(DeliveryTracker())
        bridge?.registerPluginInstance(OrderLive())
        bridge?.registerPluginInstance(AppPush())
    }
}

@objc(DeliveryTracker)
public class DeliveryTracker: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeliveryTracker"
    public let jsName = "DeliveryTracker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    @objc func prepare(_ call: CAPPluginCall) {
        DispatchQueue.main.async { TripLocation.shared.prepare(call) }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let order = call.getString("orderId"), let ticket = call.getString("ticket"),
                  let url = call.getString("endpoint"), let key = call.getString("apiKey") else {
                call.reject("Configuração de entrega incompleta."); return
            }
            let config = ["order": order, "ticket": ticket, "url": url, "key": key]
            if TripLocation.shared.start(config) { call.resolve() }
            else { call.reject("Permita a localização nos ajustes do iPhone.") }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripLocation.shared.stop(order: call.getString("orderId"))
            call.resolve()
        }
    }
}

final class TripLocation: NSObject, CLLocationManagerDelegate {
    static let shared = TripLocation()
    private let manager = CLLocationManager()
    private let settingsKey = "activeDeliveryLocation"
    private var config: [String:String]?
    private var pendingPermission: CAPPluginCall?
    private var latest: CLLocation?
    private var request: URLSessionDataTask?
    private var retry: Timer?
    private var lastAttempt = Date.distantPast
    private var lastHeartbeat = Date.distantPast
    private let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.activityType = .automotiveNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        manager.showsBackgroundLocationIndicator = true
    }

    private var authorized: Bool {
        let status = CLLocationManager.authorizationStatus()
        return status == .authorizedAlways || status == .authorizedWhenInUse
    }

    private var precise: Bool {
        if #available(iOS 14.0, *) { return manager.accuracyAuthorization == .fullAccuracy }
        return true
    }

    private func completePermission(_ call: CAPPluginCall) {
        if authorized && precise { call.resolve() }
        else { call.reject("Permita a localização precisa nos ajustes do iPhone para iniciar a entrega.") }
    }

    func prepare(_ call: CAPPluginCall) {
        if authorized { completePermission(call); return }
        if CLLocationManager.authorizationStatus() == .notDetermined {
            pendingPermission = call
            manager.requestWhenInUseAuthorization()
        } else {
            call.reject("Permita a localização nos ajustes do iPhone.")
        }
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        if status != .notDetermined, let call = pendingPermission {
            pendingPermission = nil
            completePermission(call)
        }
        if status == .authorizedAlways, config != nil, CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        }
    }

    func restore() {
        if let saved = UserDefaults.standard.dictionary(forKey: settingsKey) as? [String:String] {
            _ = start(saved)
        }
    }

    func start(_ trip: [String:String]) -> Bool {
        guard authorized && precise else { return false }
        if config == trip { return true }
        stop(order: nil)
        config = trip
        UserDefaults.standard.set(trip, forKey: settingsKey)
        manager.allowsBackgroundLocationUpdates = true
        manager.startUpdatingLocation()
        if CLLocationManager.authorizationStatus() == .authorizedWhenInUse && UIApplication.shared.applicationState == .active {
            manager.requestAlwaysAuthorization()
        }
        if CLLocationManager.authorizationStatus() == .authorizedAlways && CLLocationManager.significantLocationChangeMonitoringAvailable() {
            manager.startMonitoringSignificantLocationChanges()
        }
        retry = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.upload() }
        return true
    }

    func stop(order: String?) {
        if let order = order, order != config?["order"] { return }
        config = nil
        retry?.invalidate()
        retry = nil
        request?.cancel()
        request = nil
        latest = nil
        lastAttempt = .distantPast
        lastHeartbeat = .distantPast
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        UserDefaults.standard.removeObject(forKey: settingsKey)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let fix = locations.last(where: { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 150 }),
           fix.timestamp > (latest?.timestamp ?? Date.distantPast) {
            latest = fix
        }
        upload()
    }

    private func upload() {
        guard request == nil, Date().timeIntervalSince(lastAttempt) >= 5,
              latest != nil || Date().timeIntervalSince(lastHeartbeat) >= 30,
              let trip = config, let endpoint = trip["url"], let url = URL(string: endpoint),
              let order = trip["order"], let ticket = trip["ticket"], let key = trip["key"] else { return }
        let fix = latest
        var payload: [String:Any] = ["p_order_id": order, "p_ticket": ticket, "p_lat": NSNull(),
                                     "p_lng": NSNull(), "p_at": NSNull()]
        if let fix = fix {
            payload["p_lat"] = fix.coordinate.latitude
            payload["p_lng"] = fix.coordinate.longitude
            payload["p_at"] = formatter.string(from: fix.timestamp)
        }
        var req = URLRequest(url: url, timeoutInterval: 12)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "apikey")
        if key.hasPrefix("eyJ") { req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization") }
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        lastAttempt = Date()
        lastHeartbeat = lastAttempt
        request = URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self = self, self.config == trip else { return }
                self.request = nil
                guard (response as? HTTPURLResponse)?.statusCode == 200,
                      let data = data, let active = try? JSONDecoder().decode(Bool.self, from: data) else { return }
                if !active { self.stop(order: order) }
                else if self.latest?.timestamp == fix?.timestamp { self.latest = nil }
            }
        }
        request?.resume()
    }
}
