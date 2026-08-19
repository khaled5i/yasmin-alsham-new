package com.yasminalsham.attendancebridge.sync;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import com.yasminalsham.attendancebridge.MainActivity;
import com.yasminalsham.attendancebridge.R;
import com.yasminalsham.attendancebridge.config.AttendancePreferences;
import com.yasminalsham.attendancebridge.network.NetworkMonitor;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AttendanceSyncService extends Service {
    public static final String ACTION_START = "attendance.START";
    public static final String ACTION_STOP = "attendance.STOP";
    public static final String ACTION_SYNC_NOW = "attendance.SYNC_NOW";
    public static final String ACTION_CONFIG_CHANGED = "attendance.CONFIG_CHANGED";
    public static final String ACTION_STATUS = "attendance.STATUS";
    public static final String EXTRA_MESSAGE = "message";

    private static final String CHANNEL_ID = "attendance_sync";
    private static final int NOTIFICATION_ID = 4102;
    private static volatile boolean running;
    private static volatile String lastMessage = "بانتظار أول مزامنة";

    private final AtomicBoolean syncQueued = new AtomicBoolean(false);
    private ScheduledExecutorService executor;
    private ScheduledFuture<?> periodicTask;
    private NetworkMonitor networkMonitor;
    private AttendancePreferences preferences;

    @Override
    public void onCreate() {
        super.onCreate();
        preferences = new AttendancePreferences(this);
        executor = Executors.newSingleThreadScheduledExecutor();
        createNotificationChannel();
        promoteToForeground(buildNotification(lastMessage));
        running = true;
        networkMonitor = new NetworkMonitor(this, this::triggerSync);
        networkMonitor.start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            preferences.setEnabled(false);
            SyncScheduler.cancel(this);
            stopLoop();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (!preferences.isEnabled() || !preferences.hasCompleteConfiguration()) {
            lastMessage = "افتح التطبيق وأكمل الإعدادات أولًا";
            updateNotification(lastMessage);
            if (!preferences.isEnabled()) {
                stopSelf();
                return START_NOT_STICKY;
            }
        } else {
            SyncScheduler.schedule(this);
            startLoop();
            if (ACTION_SYNC_NOW.equals(action) || ACTION_CONFIG_CHANGED.equals(action)) {
                triggerSync();
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        stopLoop();
        if (networkMonitor != null) networkMonitor.close();
        if (executor != null) executor.shutdownNow();
        broadcastStatus("توقفت خدمة المزامنة");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private synchronized void startLoop() {
        if (periodicTask != null && !periodicTask.isCancelled()) return;
        periodicTask = executor.scheduleWithFixedDelay(
                this::runSync,
                0,
                Math.max(30, preferences.getPollIntervalSeconds()),
                TimeUnit.SECONDS
        );
    }

    private synchronized void stopLoop() {
        if (periodicTask != null) periodicTask.cancel(true);
        periodicTask = null;
    }

    private void triggerSync() {
        if (executor == null || executor.isShutdown()) return;
        if (syncQueued.compareAndSet(false, true)) {
            executor.execute(() -> {
                try {
                    runSync();
                } finally {
                    syncQueued.set(false);
                }
            });
        }
    }

    private void runSync() {
        AttendanceSynchronizer.SyncRunResult result =
                new AttendanceSynchronizer(this).runOnce();
        if (!result.error.isEmpty()) {
            lastMessage = result.error;
        } else if (result.uploadedCount > 0) {
            lastMessage = "تم إرسال " + result.uploadedCount
                    + " سجل · المتبقي " + result.pendingCount;
        } else if (result.pendingCount > 0) {
            lastMessage = "بانتظار الإنترنت · " + result.pendingCount + " سجل محفوظ محليًا";
        } else {
            lastMessage = "المزامنة تعمل · لا توجد سجلات معلقة";
        }
        updateNotification(lastMessage);
        broadcastStatus(lastMessage);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("تشغيل الاتصال المحلي الآمن بأجهزة الحضور");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String message) {
        Intent activityIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_attendance)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(message)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void promoteToForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification(String message) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(message));
    }

    private void broadcastStatus(String message) {
        Intent status = new Intent(ACTION_STATUS);
        status.setPackage(getPackageName());
        status.putExtra(EXTRA_MESSAGE, message);
        sendBroadcast(status);
    }

    public static boolean isRunning() {
        return running;
    }

    public static String getLastMessage() {
        return lastMessage;
    }
}
