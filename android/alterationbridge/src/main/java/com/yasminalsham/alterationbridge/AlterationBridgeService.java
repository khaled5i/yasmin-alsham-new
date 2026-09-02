package com.yasminalsham.alterationbridge;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import com.yasminalsham.alterationbridge.config.StationPreferences;
import com.yasminalsham.alterationbridge.model.StationStatus;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;

public final class AlterationBridgeService extends Service implements StationCoordinator.Listener {
    public static final String ACTION_START = "com.yasminalsham.alterationbridge.START";
    public static final String ACTION_STOP = "com.yasminalsham.alterationbridge.STOP";
    public static final String ACTION_UNPAIR = "com.yasminalsham.alterationbridge.UNPAIR";
    public static final String ACTION_CONFIG_CHANGED =
            "com.yasminalsham.alterationbridge.CONFIG_CHANGED";
    public static final String ACTION_STATUS = "com.yasminalsham.alterationbridge.STATUS";

    public static final String EXTRA_ROLE = "role";
    public static final String EXTRA_MESSAGE = "message";

    private static final int NOTIFICATION_ID = 19381;
    private static final String CHANNEL_ID = "yasmin_alteration_station";
    private static final AtomicReference<StationStatus> LAST_STATUS =
            new AtomicReference<>(StationStatus.initial());
    private static volatile boolean running;

    private StationPreferences preferences;
    private StationCoordinator coordinator;
    private DiagnosticHttpServer diagnosticServer;
    private PowerManager.WakeLock wakeLock;
    private boolean explicitlyStopped;

    public static boolean isRunning() {
        return running;
    }

    public static StationStatus getLastStatus() {
        return LAST_STATUS.get();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        preferences = new StationPreferences(this);
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("جارٍ تشغيل محطة طباعة التعديلات"));
        acquireWakeLock();

        coordinator = new StationCoordinator(this, this);
        diagnosticServer = new DiagnosticHttpServer(this::buildHealthJson);
        diagnosticServer.start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action) || ACTION_UNPAIR.equals(action)) {
            explicitlyStopped = true;
            if (coordinator != null) coordinator.stop(true);
            preferences.setEnabled(false);
            if (ACTION_UNPAIR.equals(action)) preferences.clearPairing();
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (explicitlyStopped) {
            explicitlyStopped = false;
            coordinator = new StationCoordinator(this, this);
        }
        preferences.setEnabled(true);
        running = true;
        acquireWakeLock();
        if (coordinator != null) {
            coordinator.start();
            if (ACTION_CONFIG_CHANGED.equals(action)) coordinator.configurationChanged();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (diagnosticServer != null) diagnosticServer.close();
        if (coordinator != null) coordinator.stop(!explicitlyStopped);
        releaseWakeLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onStatusChanged(StationStatus status) {
        LAST_STATUS.set(status);
        updateNotification(notificationText(status));

        Intent intent = new Intent(ACTION_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_ROLE, status.role.name());
        intent.putExtra(EXTRA_MESSAGE, status.lastError);
        sendBroadcast(intent);
    }

    @Override
    public void onEvent(String message) {
        Intent intent = new Intent(ACTION_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_ROLE, LAST_STATUS.get().role.name());
        intent.putExtra(EXTRA_MESSAGE, message);
        sendBroadcast(intent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("محطة الطباعة التلقائية لورشة التعديلات");
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_printer)
                .setContentTitle("محطة طباعة التعديلات")
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void updateNotification(String text) {
        NotificationManager manager =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(text));
    }

    @SuppressLint("WakelockTimeout")
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager == null) return;
        wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                getPackageName() + ":alterations_print_station"
        );
        wakeLock.setReferenceCounted(false);
        try {
            wakeLock.acquire();
        } catch (RuntimeException ignored) {
        }
    }

    private void releaseWakeLock() {
        PowerManager.WakeLock lock = wakeLock;
        wakeLock = null;
        if (lock == null || !lock.isHeld()) return;
        try {
            lock.release();
        } catch (RuntimeException ignored) {
        }
    }

    private String notificationText(StationStatus status) {
        switch (status.role) {
            case ACTIVE:
                return status.printerReachable
                        ? "المحطة الرئيسية جاهزة وطابعة الورشة متصلة"
                        : "المحطة الرئيسية تعمل، وطابعة الورشة غير متاحة";
            case STANDBY:
                return "المحطة الاحتياطية تراقب المحطة الرئيسية";
            case UNPAIRED:
                return "يلزم إدخال رمز ربط المحطة";
            case OFFLINE:
                return status.lastError.isEmpty()
                        ? "الاتصال بالسحابة غير متاح"
                        : status.lastError;
            case STOPPED:
            default:
                return "محطة الطباعة متوقفة";
        }
    }

    private String buildHealthJson() {
        StationStatus status = LAST_STATUS.get();
        StationPreferences.PairingCredentials credentials = preferences.getCredentials();
        JSONObject json = new JSONObject();
        try {
            json.put("ok", running);
            json.put("service", "yasmin-alteration-print-station");
            json.put("version", BuildConfig.VERSION_NAME);
            json.put("directPrintEnabled", false);
            json.put("paired", credentials != null);
            json.put("role", status.role.name().toLowerCase(Locale.ROOT));
            json.put("printerIp", preferences.getPrinterIp());
            json.put("printerPort", 9100);
            json.put("printerReachable", status.printerReachable);
            json.put("pendingCount", status.pendingCount);
            json.put("unknownCount", status.unknownCount);
            json.put("lastError", status.lastError);
        } catch (JSONException ignored) {
        }
        return json.toString();
    }
}
