import ActivityKit
import Capacitor
import UIKit

@objc(OrderLive)
public class OrderLive: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OrderLive"
    public let jsName = "OrderLive"
    public let pluginMethods = ["known", "display", "clear"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    static var opened: String?

    @objc func known(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var ids: [String] = []
            if #available(iOS 16.1, *) { ids = Activity<OrderAttributes>.activities.map { $0.attributes.orderId } }
            var result: [String: Any] = ["ids": ids]
            if let id = Self.opened { result["opened"] = id; Self.opened = nil }
            call.resolve(result)
        }
    }

    @objc func display(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        Task { @MainActor in
            do { try await CustomerActivities.shared.display(call); call.resolve() }
            catch { call.reject("Atividade indisponível.") }
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        Task { @MainActor in
            await CustomerActivities.shared.clear()
            Self.opened = nil
            call.resolve()
        }
    }
}

@available(iOS 16.1, *)
@MainActor
private final class CustomerActivities {
    static let shared = CustomerActivities()
    private struct Registration {
        let device: String, endpoint: URL, key: String, bearer: String
    }
    private var registrations: [String: Registration] = [:]
    private var observers: [String: Task<Void, Never>] = [:]
    private var sent: [String: String] = [:]
    private var dismissed: Set<String> = []

    func display(_ call: CAPPluginCall) async throws {
        guard let id = call.getString("orderId"), let title = call.getString("title"),
              let revision = call.getDouble("revision"), let code = call.getString("code") else { return }
        let current = Activity<OrderAttributes>.activities.first { $0.attributes.orderId == id }
        let state = OrderAttributes.ContentState(title: title, progress: call.getInt("progress") ?? 1,
            total: call.getInt("total") ?? 7, eta: call.getInt("eta"), revision: Int64(revision))
        if call.getBool("terminal") == true {
            forget(id)
            dismissed.remove(id)
            await current?.end(using: state, dismissalPolicy: .immediate)
            return
        }
        if current == nil && observers[id] != nil { dismissed.insert(id); forget(id) }
        guard !dismissed.contains(id), ActivityAuthorizationInfo().areActivitiesEnabled,
              let base = call.getString("endpoint"), let url = URL(string: base + "/rest/v1/rpc/register_order_live"),
              let key = call.getString("apiKey"), let bearer = call.getString("bearer"),
              let device = call.getString("device") else { return }
        registrations[id] = Registration(device: device, endpoint: url, key: key, bearer: bearer)
        let activity: Activity<OrderAttributes>
        if let current = current {
            activity = current
            let previous = current.contentState
            if previous.revision < state.revision && (previous.title != state.title || previous.progress != state.progress || previous.eta != state.eta) {
                await current.update(using: state)
            }
        } else {
            activity = try Activity.request(attributes: OrderAttributes(orderId: id, code: code), contentState: state, pushType: .token)
        }
        if observers[id] == nil {
            observers[id] = Task {
                for await token in activity.pushTokenUpdates {
                    if Task.isCancelled { break }
                    await register(token, for: id)
                }
            }
        }
        if let token = activity.pushToken { await register(token, for: id) }
    }

    private func register(_ data: Data, for id: String) async {
        let token = data.map { String(format: "%02x", $0) }.joined()
        guard sent[id] != token, let config = registrations[id] else { return }
        var request = URLRequest(url: config.endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.key, forHTTPHeaderField: "apikey")
        request.setValue("Bearer " + config.bearer, forHTTPHeaderField: "Authorization")
        let sandbox = Bundle.main.object(forInfoDictionaryKey: "OrderPushEnvironment") as? String == "development"
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "p_order": id, "p_installation": config.device, "p_token": token,
            "p_platform": sandbox ? "ios-sandbox" : "ios"
        ])
        let task = UIApplication.shared.beginBackgroundTask(withName: "Registrar atividade")
        defer { if task != .invalid { UIApplication.shared.endBackgroundTask(task) } }
        if let (_, response) = try? await URLSession.shared.data(for: request),
           let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
           registrations[id]?.device == config.device { sent[id] = token }
    }

    private func forget(_ id: String) {
        observers.removeValue(forKey: id)?.cancel()
        registrations.removeValue(forKey: id)
        sent.removeValue(forKey: id)
    }

    func clear() async {
        dismissed.removeAll()
        for id in Array(registrations.keys) { forget(id) }
        for activity in Activity<OrderAttributes>.activities { await activity.end(using: nil, dismissalPolicy: .immediate) }
    }
}
