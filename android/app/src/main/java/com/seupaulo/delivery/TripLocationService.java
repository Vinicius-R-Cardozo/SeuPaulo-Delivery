package com.seupaulo.delivery;

import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.location.*;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public class TripLocationService extends Service implements LocationListener {
    private static final String CHANNEL = "delivery_location";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private LocationManager manager;
    private Location latest;
    private String order;
    private boolean sending;
    private long nextSend;
    private long lastCheck;
    private final Runnable tick = new Runnable() {
        @Override public void run() { upload(); handler.postDelayed(this, 5000); }
    };

    @SuppressLint("MissingPermission")
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager notices = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) notices.createNotificationChannel(new NotificationChannel(
            CHANNEL, "Entrega em andamento", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent action = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(401, new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Entrega em andamento")
            .setContentText("Compartilhando sua localização com o cliente").setContentIntent(action)
            .setOnlyAlertOnce(true).setOngoing(true).build());
        String current = DeliveryTracker.prefs(this).getString("order", null);
        if (current == null) { stopSelf(); return START_NOT_STICKY; }
        if (!current.equals(order)) { latest = null; nextSend = 0; order = current; }
        if (manager == null) {
            manager = (LocationManager)getSystemService(LOCATION_SERVICE);
            try {
                manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 3000, 0, this);
                if (manager.getAllProviders().contains(LocationManager.NETWORK_PROVIDER))
                    manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 0, this);
            } catch (SecurityException ex) { stopSelf(); return START_NOT_STICKY; }
            handler.post(tick);
        }
        return START_STICKY;
    }

    @Override public void onLocationChanged(Location fix) {
        if (fix.hasAccuracy() && fix.getAccuracy() <= 150 &&
            (latest == null || fix.getTime() > latest.getTime())) {
            latest = fix;
            upload();
        }
    }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void upload() {
        long now = SystemClock.elapsedRealtime();
        if (sending || order == null || now < nextSend || (latest == null && now-lastCheck < 30000)) return;
        SharedPreferences prefs = DeliveryTracker.prefs(this);
        String active = order, endpoint = prefs.getString("endpoint",null);
        String key = prefs.getString("key",null), ticket = prefs.getString("ticket",null);
        if (!active.equals(prefs.getString("order",null)) || endpoint == null) return;
        Location fix = latest;
        sending = true;
        nextSend = now+5000;
        lastCheck = now;
        network.execute(() -> {
            HttpURLConnection conn = null;
            boolean success = false, ended = false;
            try {
                JSONObject body = new JSONObject();
                body.put("p_order_id",active).put("p_ticket",ticket);
                SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                iso.setTimeZone(TimeZone.getTimeZone("UTC"));
                body.put("p_lat",fix == null ? JSONObject.NULL : fix.getLatitude());
                body.put("p_lng",fix == null ? JSONObject.NULL : fix.getLongitude());
                body.put("p_at",fix == null ? JSONObject.NULL : iso.format(new Date(fix.getTime())));
                conn = (HttpURLConnection)new URL(endpoint).openConnection();
                conn.setConnectTimeout(8000); conn.setReadTimeout(8000); conn.setInstanceFollowRedirects(false);
                conn.setRequestMethod("POST"); conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type","application/json");
                conn.setRequestProperty("apikey",key);
                if (key.startsWith("eyJ")) conn.setRequestProperty("Authorization","Bearer "+key);
                try (OutputStream out = conn.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                if (conn.getResponseCode()==200) {
                    try (BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(),StandardCharsets.UTF_8))) {
                        String answer = in.readLine();
                        ended = "false".equals(answer);
                        success = ended || "true".equals(answer);
                    }
                }
            } catch (Exception ignored) { /* Keep only the newest fix for retry. */ }
            finally { if (conn != null) conn.disconnect(); }
            final boolean stop = ended, sent = success;
            handler.post(() -> {
                sending = false;
                if (!active.equals(DeliveryTracker.prefs(this).getString("order",null))) return;
                if (stop) { DeliveryTracker.prefs(this).edit().clear().apply(); stopSelf(); }
                else if (sent && latest == fix) latest = null;
            });
        });
    }
    @Override public void onDestroy() {
        order = null;
        handler.removeCallbacks(tick);
        if (manager != null) manager.removeUpdates(this);
        network.shutdownNow();
        stopForeground(true);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
