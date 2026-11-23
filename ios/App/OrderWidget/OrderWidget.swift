import ActivityKit
import SwiftUI
import WidgetKit

@main
struct OrderWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OrderAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Seu Paulo", systemImage: "fork.knife").font(.headline)
                    Spacer()
                    Text("Pedido " + context.attributes.code).font(.caption)
                }
                HStack {
                    Text(context.state.title).font(.headline)
                    Spacer()
                    if let eta = context.state.eta { Text("~\(eta) min").monospacedDigit() }
                }
                ProgressView(value: Double(context.state.progress), total: Double(context.state.total))
                    .tint(.yellow)
            }
            .padding().foregroundStyle(.white).activityBackgroundTint(Color(white: 0.09))
            .widgetURL(URL(string: "seupaulo://pedido/" + context.attributes.orderId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Label("Seu Paulo", systemImage: "fork.knife") }
                DynamicIslandExpandedRegion(.trailing) {
                    if let eta = context.state.eta { Text("~\(eta) min").monospacedDigit() }
                }
                DynamicIslandExpandedRegion(.bottom) { Text(context.state.title) }
            } compactLeading: { Image(systemName: "fork.knife") } compactTrailing: {
                if let eta = context.state.eta { Text("\(eta)m").monospacedDigit() }
                else { Text("\(context.state.progress)/\(context.state.total)") }
            } minimal: { Image(systemName: "fork.knife") }
            .widgetURL(URL(string: "seupaulo://pedido/" + context.attributes.orderId))
        }
    }
}
