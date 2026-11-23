package com.seupaulo.delivery;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.LocationManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name="DeliveryTracker", permissions={
    @Permission(alias="gps", strings={Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION})
})
public class DeliveryTracker extends Plugin {
    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("active_delivery", Context.MODE_PRIVATE);
    }

    @PluginMethod public void prepare(PluginCall call) {
        if (getPermissionState("gps") == PermissionState.GRANTED) checkGps(call);
        else requestPermissionForAlias("gps", call, "checkGps");
    }

    @PermissionCallback private void checkGps(PluginCall call) {
        LocationManager manager = (LocationManager)getContext().getSystemService(Context.LOCATION_SERVICE);
        if (getPermissionState("gps") != PermissionState.GRANTED)
            call.reject("Permita a localização precisa nos ajustes para iniciar a entrega.");
        else if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER))
            call.reject("Ative o GPS do aparelho para iniciar a entrega.");
        else call.resolve();
    }

    @PluginMethod public void start(PluginCall call) {
        if (getPermissionState("gps") != PermissionState.GRANTED) {
            call.reject("Permita a localização precisa nos ajustes do app."); return;
        }
        String order = call.getString("orderId"), ticket = call.getString("ticket");
        String endpoint = call.getString("endpoint"), key = call.getString("apiKey");
        if (order == null || ticket == null || endpoint == null || key == null) {
            call.reject("Configuração de entrega incompleta."); return;
        }
        Context ctx = getContext();
        try {
            prefs(ctx).edit().putString("order",order).putString("ticket",ticket)
                .putString("endpoint",endpoint).putString("key",key).apply();
            ContextCompat.startForegroundService(ctx, new Intent(ctx, TripLocationService.class));
            call.resolve();
        } catch (RuntimeException ex) {
            call.reject("Abra o app para retomar a localização.", ex);
        }
    }

    @PluginMethod public void stop(PluginCall call) {
        Context ctx = getContext();
        String order = call.getString("orderId");
        if (order == null || order.equals(prefs(ctx).getString("order",null))) {
            prefs(ctx).edit().clear().apply();
            ctx.stopService(new Intent(ctx, TripLocationService.class));
        }
        call.resolve();
    }
}
