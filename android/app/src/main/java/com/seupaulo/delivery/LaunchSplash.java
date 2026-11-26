package com.seupaulo.delivery;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LaunchSplash")
public class LaunchSplash extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> activity.markWebSplashReady(call::resolve));
    }

    @PluginMethod
    public void finish(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        activity.runOnUiThread(() -> {
            activity.finishWebSplash();
            call.resolve();
        });
    }
}
