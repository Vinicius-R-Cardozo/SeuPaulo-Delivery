package com.seupaulo.delivery;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.lang.ref.WeakReference;
import java.util.Map;

@CapacitorPlugin(name="AppPush", permissions=@Permission(alias="notifications", strings={Manifest.permission.POST_NOTIFICATIONS}))
public class AppPush extends Plugin {
    private static final String CHANNEL = "order_alerts";
    private static final String PREFIX = "seupaulo-alert:";
    private static final String OPEN = "app_push_route";
    private static WeakReference<AppPush> instance = new WeakReference<>(null);

    private static SharedPreferences preferences(Context ctx) {
        return ctx.getSharedPreferences("appPushSettings", Context.MODE_PRIVATE);
    }

    @Override public void load() {
        instance = new WeakReference<>(this);
        capture(getActivity().getIntent());
    }

    @Override protected void handleOnNewIntent(Intent intent) {
        capture(intent);
        changed();
    }

    private void capture(Intent intent) {
        if (intent != null && intent.hasExtra(OPEN)) {
            preferences(getContext()).edit().putString(OPEN, intent.getStringExtra(OPEN)).apply();
            intent.removeExtra(OPEN);
        }
    }

    static void changed() {
        AppPush plugin = instance.get();
        if (plugin != null) plugin.notifyListeners("pushChanged", new JSObject());
    }

    @PluginMethod public void state(PluginCall call) {
        if (FirebaseApp.getApps(getContext()).isEmpty()) { resolveState(call, null); return; }
        SharedPreferences asked = getContext().getSharedPreferences("orderLiveSettings", Context.MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED
            && !asked.getBoolean("asked", false)) {
            asked.edit().putBoolean("asked", true).apply();
            requestPermissionForAlias("notifications", call, "afterPermission");
        } else afterPermission(call);
    }

    @PermissionCallback private void afterPermission(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            resolveState(call, null); return;
        }
        FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(task -> resolveState(call, task.isSuccessful() ? task.getResult() : null));
    }

    private void resolveState(PluginCall call, String token) {
        SharedPreferences p = preferences(getContext());
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("token", token);
        result.put("route", p.getString(OPEN, null));
        p.edit().remove(OPEN).apply();
        call.resolve(result);
    }

    @PluginMethod public void enable(PluginCall call) {
        preferences(getContext()).edit().putBoolean("enabled", call.getBoolean("enabled", false)).apply();
        call.resolve();
    }

    @PluginMethod public void clear(PluginCall call) {
        preferences(getContext()).edit().clear().apply();
        if (Build.VERSION.SDK_INT >= 23) {
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            for (StatusBarNotification note : manager.getActiveNotifications()) {
                if (note.getTag() != null && note.getTag().startsWith(PREFIX)) manager.cancel(note.getTag(), note.getId());
            }
        }
        call.resolve();
    }

    static void show(Context ctx, Map<String, String> data) {
        String event = data.get("appPush");
        String route = data.get("route");
        NotificationManagerCompat manager = NotificationManagerCompat.from(ctx);
        if (event == null || route == null || !preferences(ctx).getBoolean("enabled", false)
            || !manager.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 26) ctx.getSystemService(NotificationManager.class)
            .createNotificationChannel(new NotificationChannel(CHANNEL, "Avisos de pedidos e entregas", NotificationManager.IMPORTANCE_HIGH));
        Intent intent = new Intent(ctx, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("seupaulo://aviso/" + event)).putExtra(OPEN, route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder message = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_order_live).setContentTitle(data.get("title"))
            .setContentText(data.get("body")).setContentIntent(tap).setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH).setDefaults(NotificationCompat.DEFAULT_SOUND)
            .setOnlyAlertOnce(true);
        manager.notify(PREFIX + event, 1, message.build());
    }
}
