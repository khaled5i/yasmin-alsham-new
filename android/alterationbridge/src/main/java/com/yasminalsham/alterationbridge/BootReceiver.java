package com.yasminalsham.alterationbridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.yasminalsham.alterationbridge.config.StationPreferences;

public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        if (!new StationPreferences(context).isEnabled()) return;

        Intent serviceIntent = new Intent(context, AlterationBridgeService.class);
        serviceIntent.setAction(AlterationBridgeService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (RuntimeException ignored) {
            // The user can reopen the app if a vendor-specific battery manager
            // prevents background startup after boot.
        }
    }
}
