package com.seupaulo.delivery;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import android.content.SharedPreferences;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

public class OrderMessageService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        SharedPreferences prefs = getSharedPreferences("orderLiveSettings", MODE_PRIVATE);
        String old = prefs.getString("token", null);
        String endpoint = prefs.getString("endpoint", null);
        if (old == null || endpoint == null || old.equals(token)) return;
        HttpURLConnection http = null;
        try {
            JSONObject args = new JSONObject().put("p_installation", prefs.getString("device", ""))
                .put("p_old", old).put("p_new", token);
            http = (HttpURLConnection) new URL(endpoint + "/rest/v1/rpc/rotate_order_live_android").openConnection();
            http.setConnectTimeout(5000);
            http.setReadTimeout(5000);
            http.setRequestMethod("POST");
            http.setDoOutput(true);
            http.setRequestProperty("Content-Type", "application/json");
            http.setRequestProperty("apikey", prefs.getString("key", ""));
            try (OutputStream out = http.getOutputStream()) {
                out.write(args.toString().getBytes(StandardCharsets.UTF_8));
            }
            if (http.getResponseCode()/100 == 2 && old.equals(prefs.getString("token", null)))
                prefs.edit().putString("token", token).apply();
        } catch (Exception ignored) {
            // The next foreground sync registers the fresh FCM token again.
        } finally { if (http != null) http.disconnect(); }
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        String update = message.getData().get("orderLive");
        if (update == null) return;
        try { OrderNotification.show(this, new JSONObject(update), false); }
        catch (JSONException ignored) { }
    }
}
