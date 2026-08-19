package com.yasminalsham.attendancebridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.yasminalsham.attendancebridge.config.AttendancePreferences;
import com.yasminalsham.attendancebridge.sync.AttendanceSyncService;
import com.yasminalsham.attendancebridge.sync.SyncScheduler;

public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }

        AttendancePreferences preferences = new AttendancePreferences(context);
        if (!preferences.isEnabled() || !preferences.hasCompleteConfiguration()) return;
        SyncScheduler.schedule(context);
        SyncScheduler.enqueueImmediate(context);

        Intent serviceIntent = new Intent(context, AttendanceSyncService.class);
        serviceIntent.setAction(AttendanceSyncService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (RuntimeException ignored) {
            // WorkManager remains the persisted safety net on devices whose
            // vendor-specific auto-start manager blocks boot-time services.
        }
    }
}
