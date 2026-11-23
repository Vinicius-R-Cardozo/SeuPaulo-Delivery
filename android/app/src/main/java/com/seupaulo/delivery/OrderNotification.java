package com.seupaulo.delivery;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONObject;

final class OrderNotification {
    private static final String CHANNEL = "customer_orders";
    static SharedPreferences orders(Context ctx) {
        return ctx.getSharedPreferences("liveCustomerOrders", Context.MODE_PRIVATE);
    }
    private static SharedPreferences displayed(Context ctx) {
        return ctx.getSharedPreferences("orderNotificationContent", Context.MODE_PRIVATE);
    }
    static synchronized void clear(Context ctx) {
        for (String id : orders(ctx).getAll().keySet())
            NotificationManagerCompat.from(ctx).cancel(id, 1);
        orders(ctx).edit().clear().apply();
        displayed(ctx).edit().clear().apply();
    }

    static synchronized void show(Context ctx, JSONObject state, boolean foreground) {
        String id = state.optString("orderId");
        if (id.isEmpty()) return;
        SharedPreferences tracked = orders(ctx);
        // Pushes may be delayed or repeated, including after logout or delivery.
        if (!foreground && !tracked.contains(id)) return;
        long revision = state.optLong("revision");
        if (revision < tracked.getLong(id, -1)) return;
        NotificationManagerCompat manager = NotificationManagerCompat.from(ctx);
        if (state.optBoolean("terminal")) {
            tracked.edit().remove(id).apply();
            displayed(ctx).edit().remove(id).apply();
            manager.cancel(id, 1);
            return;
        }
        if (Build.VERSION.SDK_INT >= 26)
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(CHANNEL, "Pedidos em andamento", NotificationManager.IMPORTANCE_DEFAULT));
        if (!manager.areNotificationsEnabled()) {
            tracked.edit().putLong(id, revision).apply();
            return;
        }
        String label = state.optString("title");
        int eta = state.optInt("eta", 0);
        String content = label + "|" + eta + "|" + state.optInt("progress") + "|" + state.optInt("total");
        if (content.equals(displayed(ctx).getString(id, null))) {
            tracked.edit().putLong(id, revision).apply();
            return;
        }
        Intent open = new Intent(ctx, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("seupaulo://pedido/" + id)).putExtra("opened_order", id)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Bundle extras = new Bundle();
        // Public platform extra on Android 16+, harmless on earlier releases.
        extras.putBoolean("android.requestPromotedOngoing", true);
        if (eta > 0) extras.putString("android.shortCriticalText", eta + " min");
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_order_live).setColor(0xffac2633)
            .setContentTitle(label).setContentText("Pedido " + state.optString("code") + (eta > 0 ? " · ~" + eta + " min" : ""))
            .setProgress(state.optInt("total"), state.optInt("progress"), false)
            .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
            .setContentIntent(tap).addExtras(extras);
        manager.notify(id, 1, builder.build());
        displayed(ctx).edit().putString(id, content).apply();
        tracked.edit().putLong(id, revision).apply();
    }
}
