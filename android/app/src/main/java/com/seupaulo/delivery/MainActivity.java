package com.seupaulo.delivery;

import android.os.Bundle;
import android.os.SystemClock;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean webSplashReady;
    private boolean systemSplashExited;
    private Runnable afterSplashExit;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        registerPlugin(LaunchSplash.class);
        registerPlugin(DeliveryTracker.class);
        registerPlugin(OrderLive.class);
        registerPlugin(AppPush.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        long splashDeadline = SystemClock.uptimeMillis() + 7_000L;
        splashScreen.setKeepOnScreenCondition(
            () -> !webSplashReady && SystemClock.uptimeMillis() < splashDeadline
        );
        splashScreen.setOnExitAnimationListener(provider -> {
            provider.remove();
            systemSplashExited = true;
            Runnable callback = afterSplashExit;
            afterSplashExit = null;
            if (callback != null) {
                getWindow().getDecorView().postOnAnimation(callback);
            }
        });
    }

    void markWebSplashReady(Runnable onExit) {
        webSplashReady = true;
        if (systemSplashExited) {
            onExit.run();
            return;
        }

        afterSplashExit = onExit;
        getWindow().getDecorView().postDelayed(() -> {
            if (afterSplashExit == onExit) {
                afterSplashExit = null;
                onExit.run();
            }
        }, 2_000L);
    }
}
