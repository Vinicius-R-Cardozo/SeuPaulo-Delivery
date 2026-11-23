package com.seupaulo.delivery;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONArray;

@CapacitorPlugin(name="OrderLive", permissions=@Permission(alias="notifications", strings={Manifest.permission.POST_NOTIFICATIONS}))
public class OrderLive extends Plugin {
    private static final String OPEN = "opened_order";
    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("orderLiveSettings", Context.MODE_PRIVATE);
    }

    @Override public void load() { capture(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        capture(intent);
    }

    private void capture(Intent intent) {
        if (intent == null || !intent.hasExtra(OPEN)) return;
        preferences().edit().putString(OPEN, intent.getStringExtra(OPEN)).apply();
        intent.removeExtra(OPEN);
    }

    @PluginMethod public void known(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ids", new JSONArray(OrderNotification.orders(getContext()).getAll().keySet()));
        result.put("opened", preferences().getString(OPEN, null));
        preferences().edit().remove(OPEN).apply();
        call.resolve(result);
    }

    @PluginMethod public void display(PluginCall call) {
        if (!call.getBoolean("terminal", false) && Build.VERSION.SDK_INT >= 33 &&
            getPermissionState("notifications") != PermissionState.GRANTED && !preferences().getBoolean("asked", false)) {
            preferences().edit().putBoolean("asked", true).apply();
            requestPermissionForAlias("notifications", call, "afterPermission");
        } else render(call);
    }

    @PermissionCallback private void afterPermission(PluginCall call) { render(call); }

    private void render(PluginCall call) {
        OrderNotification.show(getContext(), call.getData(), true);
        if (call.getBoolean("terminal", false) || FirebaseApp.getApps(getContext()).isEmpty()) {
            call.resolve(); return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            JSObject result = new JSObject();
            if (task.isSuccessful()) {
                String token = task.getResult();
                preferences().edit().putString("token", token).putString("device", call.getString("device"))
                    .putString("endpoint", call.getString("endpoint")).putString("key", call.getString("apiKey")).apply();
                result.put("token", token);
            }
            call.resolve(result);
        });
    }

    @PluginMethod public void clear(PluginCall call) {
        OrderNotification.clear(getContext());
        preferences().edit().remove(OPEN).remove("token").remove("device").remove("endpoint").remove("key").apply();
        call.resolve();
    }
}
