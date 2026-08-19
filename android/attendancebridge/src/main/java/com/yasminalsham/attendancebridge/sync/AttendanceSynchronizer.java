package com.yasminalsham.attendancebridge.sync;

import android.content.Context;
import android.os.PowerManager;

import com.yasminalsham.attendancebridge.config.AttendancePreferences;
import com.yasminalsham.attendancebridge.data.AttendanceDatabase;
import com.yasminalsham.attendancebridge.model.AttendanceDeviceConfig;
import com.yasminalsham.attendancebridge.model.AttendanceEvent;
import com.yasminalsham.attendancebridge.model.AttendanceRecordMapper;
import com.yasminalsham.attendancebridge.model.DeviceUser;
import com.yasminalsham.attendancebridge.network.AttendanceApiClient;
import com.yasminalsham.attendancebridge.network.DahuaClient;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

public final class AttendanceSynchronizer {
    private static final ReentrantLock RUN_LOCK = new ReentrantLock();
    private static final int MAX_UPLOAD_BATCHES_PER_RUN = 20;

    private final Context context;
    private final AttendancePreferences preferences;
    private final AttendanceDatabase database;
    private final DahuaClient dahuaClient;
    private final AttendanceApiClient apiClient;

    public AttendanceSynchronizer(Context context) {
        this.context = context.getApplicationContext();
        preferences = new AttendancePreferences(this.context);
        database = new AttendanceDatabase(this.context);
        dahuaClient = new DahuaClient(this.context);
        apiClient = new AttendanceApiClient();
    }

    public SyncRunResult runOnce() {
        try {
            return runOnceInternal();
        } finally {
            database.close();
        }
    }

    private SyncRunResult runOnceInternal() {
        if (!preferences.isEnabled()) {
            return new SyncRunResult(0, database.countPending(), "المزامنة متوقفة", false);
        }
        if (!preferences.hasCompleteConfiguration()) {
            return new SyncRunResult(
                    0,
                    database.countPending(),
                    "إعدادات المزامنة غير مكتملة",
                    false
            );
        }
        if (!RUN_LOCK.tryLock()) {
            return new SyncRunResult(0, database.countPending(), "", false);
        }

        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "yasmin:attendance-sync"
                );
                wakeLock.acquire(TimeUnit.MINUTES.toMillis(9));
            }

            int uploaded = 0;
            boolean shouldRetry = false;
            String latestError = "";
            for (AttendanceDeviceConfig device : new AttendanceDeviceConfig[]{
                    preferences.getEntryDevice(),
                    preferences.getExitDevice()
            }) {
                DeviceRunResult result = synchronizeDevice(device);
                uploaded += result.uploaded;
                shouldRetry = shouldRetry || result.shouldRetry;
                if (!result.error.isEmpty()) latestError = result.error;
            }
            int pending = database.countPending();
            if (pending > 0) shouldRetry = true;
            return new SyncRunResult(uploaded, pending, latestError, shouldRetry);
        } catch (Exception error) {
            return new SyncRunResult(
                    0,
                    database.countPending(),
                    friendlyError(error),
                    true
            );
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            RUN_LOCK.unlock();
        }
    }

    private DeviceRunResult synchronizeDevice(AttendanceDeviceConfig device) {
        boolean readSucceeded = false;
        boolean uploadSucceeded = false;
        int uploaded = 0;
        String latestError = "";

        long nowUnix = System.currentTimeMillis() / 1000L;
        long cursor = database.getCursor(device.code);
        long fromUnix = cursor > 0
                ? Math.max(0, cursor - preferences.getOverlapSeconds())
                : Math.max(0, nowUnix - preferences.getInitialLookbackSeconds());

        try {
            List<JSONObject> records = readRecordsWithRetry(device, fromUnix, nowUnix + 60);
            ArrayList<AttendanceEvent> events = new ArrayList<>();
            for (JSONObject record : records) {
                AttendanceEvent event = AttendanceRecordMapper.toEvent(device.code, record);
                if (event != null) events.add(event);
            }
            // The cursor advances only in the same durable transaction that queues
            // every parsed event. Power loss can therefore cause a safe re-read,
            // never an acknowledged gap.
            database.saveFetchedEvents(device.code, events, nowUnix);
            readSucceeded = true;

            long lastUserAttempt = database.getLastUserSyncAttempt(device.code);
            if (nowUnix - lastUserAttempt >= preferences.getUserSyncIntervalSeconds()) {
                database.markUserSyncAttempt(device.code, nowUnix);
                try {
                    List<JSONObject> rawUsers = dahuaClient.getUsers(device);
                    ArrayList<DeviceUser> users = new ArrayList<>();
                    for (JSONObject rawUser : rawUsers) {
                        DeviceUser user = AttendanceRecordMapper.toDeviceUser(rawUser);
                        if (user != null) users.add(user);
                    }
                    database.replaceDeviceUsers(device.code, users, nowUnix);
                } catch (Exception ignored) {
                    // Directory refresh is secondary. Attendance events continue to
                    // queue and upload even if this firmware omits AccessUser APIs.
                }
            }
        } catch (Exception error) {
            latestError = device.name + ": تعذر قراءة الجهاز — " + friendlyError(error);
            database.markError(device.code, latestError);
        }

        try {
            uploaded = uploadQueued(device);
            uploadSucceeded = true;
        } catch (Exception error) {
            latestError = device.name + ": تعذر الإرسال — " + friendlyError(error);
            database.markError(device.code, latestError);
        }

        if (readSucceeded && uploadSucceeded) database.clearError(device.code);
        boolean pending = database.countPending(device.code) > 0;
        return new DeviceRunResult(
                uploaded,
                latestError,
                !readSucceeded || !uploadSucceeded || pending
        );
    }

    private List<JSONObject> readRecordsWithRetry(
            AttendanceDeviceConfig device,
            long fromUnix,
            long toUnix
    ) throws Exception {
        Exception firstError;
        try {
            return dahuaClient.getRecords(device, fromUnix, toUnix);
        } catch (Exception error) {
            firstError = error;
        }

        try {
            Thread.sleep(1500);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw interrupted;
        }
        try {
            return dahuaClient.getRecords(device, fromUnix, toUnix);
        } catch (Exception secondError) {
            secondError.addSuppressed(firstError);
            throw secondError;
        }
    }

    private int uploadQueued(AttendanceDeviceConfig device) throws Exception {
        int uploaded = 0;
        boolean sentRequest = false;
        for (int batchIndex = 0; batchIndex < MAX_UPLOAD_BATCHES_PER_RUN; batchIndex++) {
            List<AttendanceEvent> events = database.getPendingEvents(device.code, 500);
            if (events.isEmpty()) break;

            AttendanceApiClient.ApiResponse response = apiClient.send(
                    preferences.getSiteUrl(),
                    preferences.getConnectorId(),
                    preferences.getIngestSecret(),
                    device.code,
                    events,
                    false,
                    Collections.emptyList()
            );
            sentRequest = true;
            if (response.received != events.size()) {
                throw new IllegalStateException("الخادم لم يؤكد كامل دفعة الحضور");
            }
            database.deleteAcknowledgedEvents(events);
            uploaded += events.size();
            database.markUploadSuccess(device.code);
        }

        if (database.isUserSnapshotPending(device.code)) {
            List<DeviceUser> users = database.getDeviceUsers(device.code);
            if (users.size() > 2000) {
                throw new IllegalStateException("قائمة مستخدمي الجهاز أكبر من الحد المسموح");
            }
            AttendanceApiClient.ApiResponse response = apiClient.send(
                    preferences.getSiteUrl(),
                    preferences.getConnectorId(),
                    preferences.getIngestSecret(),
                    device.code,
                    Collections.emptyList(),
                    true,
                    users
            );
            sentRequest = true;
            if (response.received != 0) {
                throw new IllegalStateException("الخادم لم يؤكد دفعة قائمة المستخدمين");
            }
            if (response.userSnapshotResponsePresent && !response.userSnapshotAccepted) {
                throw new IllegalStateException("الخادم لم يؤكد قائمة مستخدمي الجهاز");
            }
            // Older deployed routes ignore the optional user snapshot field. Mark
            // this attempt complete so it can be retried on the next hourly refresh
            // without ever blocking attendance events.
            database.markUserSnapshotUploaded(
                    device.code,
                    System.currentTimeMillis() / 1000L
            );
            database.markUploadSuccess(device.code);
        }

        if (!sentRequest) {
            AttendanceApiClient.ApiResponse response = apiClient.send(
                    preferences.getSiteUrl(),
                    preferences.getConnectorId(),
                    preferences.getIngestSecret(),
                    device.code,
                    Collections.emptyList(),
                    false,
                    Collections.emptyList()
            );
            if (response.received != 0) {
                throw new IllegalStateException("استجابة نبض الاتصال غير صالحة");
            }
            database.markUploadSuccess(device.code);
        }
        return uploaded;
    }

    private static String friendlyError(Throwable error) {
        String message = error == null ? "" : error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "خطأ غير معروف";
        }
        message = message.replace('\n', ' ').replace('\r', ' ').trim();
        return message.length() <= 220 ? message : message.substring(0, 220);
    }

    public static final class SyncRunResult {
        public final int uploadedCount;
        public final int pendingCount;
        public final String error;
        public final boolean shouldRetry;

        SyncRunResult(int uploadedCount, int pendingCount, String error, boolean shouldRetry) {
            this.uploadedCount = uploadedCount;
            this.pendingCount = pendingCount;
            this.error = error;
            this.shouldRetry = shouldRetry;
        }
    }

    private static final class DeviceRunResult {
        final int uploaded;
        final String error;
        final boolean shouldRetry;

        DeviceRunResult(int uploaded, String error, boolean shouldRetry) {
            this.uploaded = uploaded;
            this.error = error;
            this.shouldRetry = shouldRetry;
        }
    }
}
