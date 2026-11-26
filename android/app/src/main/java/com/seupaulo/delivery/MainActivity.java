package com.seupaulo.delivery;

import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Window;
import androidx.annotation.ColorRes;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean webSplashReady;
    private boolean systemSplashExited;
    private boolean webSplashFinished;
    private final Runnable restoreSystemBars = this::finishWebSplash;
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
        setSystemBarColors(R.color.app_launch_background);
        long splashDeadline = SystemClock.uptimeMillis() + 7_000L;
        splashScreen.setKeepOnScreenCondition(
            () -> !webSplashReady && SystemClock.uptimeMillis() < splashDeadline
        );
        splashScreen.setOnExitAnimationListener(provider -> {
            if (!webSplashFinished) {
                setSystemBarColors(R.color.app_launch_edge);
            }
            provider.remove();
            systemSplashExited = true;
            Runnable callback = afterSplashExit;
            afterSplashExit = null;
            if (callback != null) {
                getWindow().getDecorView().postOnAnimation(callback);
            }
        });
        getWindow().getDecorView().postDelayed(restoreSystemBars, 10_000L);
    }

    void finishWebSplash() {
        webSplashFinished = true;
        getWindow().getDecorView().removeCallbacks(restoreSystemBars);
        setSystemBarColors(R.color.app_window_background);
    }

    private void setSystemBarColors(@ColorRes int colorResource) {
        Window window = getWindow();
        int color = ContextCompat.getColor(this, colorResource);
        window.setStatusBarColor(color);
        window.setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(color);
        }
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
