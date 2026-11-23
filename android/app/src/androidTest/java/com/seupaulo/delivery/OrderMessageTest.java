package com.seupaulo.delivery;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class OrderMessageTest {
    private final Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final String order = java.util.UUID.randomUUID().toString();

    private static class MessageReceiver extends OrderMessageService {
        MessageReceiver(Context context) { attachBaseContext(context); }
        void receive(JSONObject state) {
            onMessageReceived(new RemoteMessage.Builder("qa").addData("orderLive", state.toString()).build());
        }
    }

    @Test public void showsAppPushOnlyWithActiveRegistrationAndReplacesRetries() throws Exception {
        String event = java.util.UUID.randomUUID().toString();
        String tag = "seupaulo-alert:" + event;
        NotificationManager manager = ctx.getSystemService(NotificationManager.class);
        android.content.SharedPreferences settings = ctx.getSharedPreferences("appPushSettings", Context.MODE_PRIVATE);
        boolean previous = settings.getBoolean("enabled", false);
        RemoteMessage notice = new RemoteMessage.Builder("qa")
            .addData("appPush", event).addData("route", "/entregador")
            .addData("title", "Nova entrega disponível").addData("body", "Abra o painel do entregador.").build();
        MessageReceiver receiver = new MessageReceiver(ctx);
        try {
            settings.edit().putBoolean("enabled", false).apply();
            receiver.onMessageReceived(notice);
            assertEquals(0, matching(manager, tag));
            settings.edit().putBoolean("enabled", true).apply();
            receiver.onMessageReceived(notice);
            for (int i = 0; i < 40 && matching(manager, tag) != 1; i++) Thread.sleep(100);
            assertEquals(1, matching(manager, tag));
            receiver.onMessageReceived(notice);
            assertEquals(1, matching(manager, tag));
        } finally {
            manager.cancel(tag, 1);
            settings.edit().putBoolean("enabled", previous).apply();
        }
    }

    private int matching(NotificationManager manager, String tag) {
        int count = 0;
        for (StatusBarNotification note : manager.getActiveNotifications())
            if (tag.equals(note.getTag())) count++;
        return count;
    }

    private Notification find() {
        for (StatusBarNotification sbn : ctx.getSystemService(NotificationManager.class).getActiveNotifications())
            if (order.equals(sbn.getTag())) return sbn.getNotification();
        return null;
    }

    private void awaitTitle(String title) throws Exception {
        for (int i = 0; i < 50; i++) {
            Notification n = find();
            if (title == null ? n == null : n != null && title.contentEquals(n.extras.getCharSequence(Notification.EXTRA_TITLE, ""))) return;
            Thread.sleep(100);
        }
        fail("Estado esperado da notificação: " + title);
    }

    @Test public void handlesUpdatesWithoutActivityAndIgnoresLatePushAfterCompletion() throws Exception {
        MessageReceiver receiver = new MessageReceiver(ctx);
        JSONObject state = new JSONObject().put("orderId",order).put("code","#QA").put("title","Pedido recebido")
            .put("total",7).put("progress",1).put("revision",1).put("terminal",false);
        try {
            OrderNotification.show(ctx, state, true);
            awaitTitle("Pedido recebido");
            JSONObject old = new JSONObject(state.toString());
            receiver.receive(state.put("title","Saiu para entrega").put("progress",5).put("eta",3).put("revision",2));
            awaitTitle("Saiu para entrega");
            receiver.receive(old);
            assertTrue(find().extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("~3 min"));
            receiver.receive(state.put("terminal",true).put("revision",3));
            awaitTitle(null);
            receiver.receive(old);
            assertNull(find());
            assertFalse(OrderNotification.orders(ctx).contains(order));
        } finally {
            OrderNotification.show(ctx,state.put("terminal",true).put("revision",4),true);
        }
    }
}
