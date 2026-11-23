import ActivityKit

@available(iOS 16.1, *)
struct OrderAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let title: String
        let progress: Int
        let total: Int
        let eta: Int?
        let revision: Int64
    }
    let orderId: String
    let code: String
}
