package com.yasminalsham.attendancebridge.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.yasminalsham.attendancebridge.model.AttendanceEvent;
import com.yasminalsham.attendancebridge.model.DeviceUser;

import java.util.ArrayList;
import java.util.List;

public final class AttendanceDatabase extends SQLiteOpenHelper {
    private static final String DATABASE_NAME = "attendance_bridge.db";
    private static final int DATABASE_VERSION = 1;
    private static final String TABLE_EVENTS = "pending_events";
    private static final String TABLE_USERS = "device_users";
    private static final String TABLE_STATE = "device_state";

    public AttendanceDatabase(Context context) {
        super(context.getApplicationContext(), DATABASE_NAME, null, DATABASE_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE " + TABLE_EVENTS + " ("
                        + "event_key TEXT PRIMARY KEY,"
                        + "device_code TEXT NOT NULL,"
                        + "device_user_id TEXT NOT NULL,"
                        + "person_name TEXT,"
                        + "occurred_at TEXT NOT NULL,"
                        + "verification_method INTEGER,"
                        + "attendance_state INTEGER,"
                        + "was_successful INTEGER NOT NULL,"
                        + "queued_at_ms INTEGER NOT NULL"
                        + ")"
        );
        db.execSQL(
                "CREATE INDEX idx_pending_attendance_device_time ON "
                        + TABLE_EVENTS + "(device_code, occurred_at, event_key)"
        );
        db.execSQL(
                "CREATE TABLE " + TABLE_USERS + " ("
                        + "device_code TEXT NOT NULL,"
                        + "device_user_id TEXT NOT NULL,"
                        + "display_name TEXT,"
                        + "user_type TEXT,"
                        + "user_status TEXT,"
                        + "PRIMARY KEY(device_code, device_user_id)"
                        + ")"
        );
        db.execSQL(
                "CREATE TABLE " + TABLE_STATE + " ("
                        + "device_code TEXT PRIMARY KEY,"
                        + "cursor_unix INTEGER NOT NULL DEFAULT 0,"
                        + "user_sync_at_unix INTEGER NOT NULL DEFAULT 0,"
                        + "user_sync_attempt_at_unix INTEGER NOT NULL DEFAULT 0,"
                        + "user_snapshot_pending INTEGER NOT NULL DEFAULT 0,"
                        + "last_read_at_ms INTEGER NOT NULL DEFAULT 0,"
                        + "last_upload_at_ms INTEGER NOT NULL DEFAULT 0,"
                        + "last_error_at_ms INTEGER NOT NULL DEFAULT 0,"
                        + "last_error TEXT"
                        + ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException(
                "Unsupported attendance database upgrade " + oldVersion + " -> " + newVersion
        );
    }

    public synchronized void saveFetchedEvents(
            String deviceCode,
            List<AttendanceEvent> events,
            long nextCursorUnix
    ) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ensureState(db, deviceCode);
            long now = System.currentTimeMillis();
            for (AttendanceEvent event : events) {
                ContentValues values = new ContentValues();
                values.put("event_key", event.eventKey);
                values.put("device_code", event.deviceCode);
                values.put("device_user_id", event.deviceUserId);
                putNullable(values, "person_name", event.personName);
                values.put("occurred_at", event.occurredAt);
                putNullable(values, "verification_method", event.verificationMethod);
                putNullable(values, "attendance_state", event.attendanceState);
                values.put("was_successful", event.wasSuccessful ? 1 : 0);
                values.put("queued_at_ms", now);
                db.insertWithOnConflict(
                        TABLE_EVENTS,
                        null,
                        values,
                        SQLiteDatabase.CONFLICT_IGNORE
                );
            }

            ContentValues state = new ContentValues();
            state.put("cursor_unix", Math.max(0, nextCursorUnix));
            state.put("last_read_at_ms", now);
            db.update(TABLE_STATE, state, "device_code = ?", new String[]{deviceCode});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public synchronized List<AttendanceEvent> getPendingEvents(String deviceCode, int limit) {
        ArrayList<AttendanceEvent> events = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                TABLE_EVENTS,
                null,
                "device_code = ?",
                new String[]{deviceCode},
                null,
                null,
                "occurred_at ASC, event_key ASC",
                String.valueOf(Math.max(1, Math.min(500, limit)))
        )) {
            while (cursor.moveToNext()) {
                events.add(new AttendanceEvent(
                        cursor.getString(cursor.getColumnIndexOrThrow("event_key")),
                        cursor.getString(cursor.getColumnIndexOrThrow("device_code")),
                        cursor.getString(cursor.getColumnIndexOrThrow("device_user_id")),
                        nullableString(cursor, "person_name"),
                        cursor.getString(cursor.getColumnIndexOrThrow("occurred_at")),
                        nullableInteger(cursor, "verification_method"),
                        nullableInteger(cursor, "attendance_state"),
                        cursor.getInt(cursor.getColumnIndexOrThrow("was_successful")) != 0
                ));
            }
        }
        return events;
    }

    public synchronized void deleteAcknowledgedEvents(List<AttendanceEvent> events) {
        if (events.isEmpty()) return;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (AttendanceEvent event : events) {
                db.delete(TABLE_EVENTS, "event_key = ?", new String[]{event.eventKey});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public synchronized void replaceDeviceUsers(
            String deviceCode,
            List<DeviceUser> users,
            long attemptUnix
    ) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ensureState(db, deviceCode);
            db.delete(TABLE_USERS, "device_code = ?", new String[]{deviceCode});
            for (DeviceUser user : users) {
                ContentValues values = new ContentValues();
                values.put("device_code", deviceCode);
                values.put("device_user_id", user.deviceUserId);
                putNullable(values, "display_name", user.displayName);
                putNullable(values, "user_type", user.userType);
                putNullable(values, "user_status", user.userStatus);
                db.insertWithOnConflict(
                        TABLE_USERS,
                        null,
                        values,
                        SQLiteDatabase.CONFLICT_REPLACE
                );
            }
            ContentValues state = new ContentValues();
            state.put("user_sync_attempt_at_unix", attemptUnix);
            state.put("user_snapshot_pending", 1);
            db.update(TABLE_STATE, state, "device_code = ?", new String[]{deviceCode});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public synchronized void markUserSyncAttempt(String deviceCode, long attemptUnix) {
        SQLiteDatabase db = getWritableDatabase();
        ensureState(db, deviceCode);
        ContentValues values = new ContentValues();
        values.put("user_sync_attempt_at_unix", attemptUnix);
        db.update(TABLE_STATE, values, "device_code = ?", new String[]{deviceCode});
    }

    public synchronized List<DeviceUser> getDeviceUsers(String deviceCode) {
        ArrayList<DeviceUser> users = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                TABLE_USERS,
                null,
                "device_code = ?",
                new String[]{deviceCode},
                null,
                null,
                "device_user_id ASC",
                "2001"
        )) {
            while (cursor.moveToNext()) {
                users.add(new DeviceUser(
                        cursor.getString(cursor.getColumnIndexOrThrow("device_user_id")),
                        nullableString(cursor, "display_name"),
                        nullableString(cursor, "user_type"),
                        nullableString(cursor, "user_status")
                ));
            }
        }
        return users;
    }

    public synchronized void markUserSnapshotUploaded(String deviceCode, long uploadedAtUnix) {
        SQLiteDatabase db = getWritableDatabase();
        ensureState(db, deviceCode);
        ContentValues values = new ContentValues();
        values.put("user_snapshot_pending", 0);
        values.put("user_sync_at_unix", uploadedAtUnix);
        db.update(TABLE_STATE, values, "device_code = ?", new String[]{deviceCode});
    }

    public synchronized long getCursor(String deviceCode) {
        return stateLong(deviceCode, "cursor_unix");
    }

    public synchronized long getLastUserSyncAttempt(String deviceCode) {
        return stateLong(deviceCode, "user_sync_attempt_at_unix");
    }

    public synchronized boolean isUserSnapshotPending(String deviceCode) {
        return stateLong(deviceCode, "user_snapshot_pending") != 0;
    }

    public synchronized int countPending() {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM " + TABLE_EVENTS,
                null
        )) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    public synchronized int countPending(String deviceCode) {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM " + TABLE_EVENTS + " WHERE device_code = ?",
                new String[]{deviceCode}
        )) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    public synchronized void markUploadSuccess(String deviceCode) {
        SQLiteDatabase db = getWritableDatabase();
        ensureState(db, deviceCode);
        ContentValues values = new ContentValues();
        values.put("last_upload_at_ms", System.currentTimeMillis());
        db.update(TABLE_STATE, values, "device_code = ?", new String[]{deviceCode});
    }

    public synchronized void clearError(String deviceCode) {
        SQLiteDatabase db = getWritableDatabase();
        ensureState(db, deviceCode);
        ContentValues values = new ContentValues();
        values.putNull("last_error");
        db.update(TABLE_STATE, values, "device_code = ?", new String[]{deviceCode});
    }

    public synchronized void markError(String deviceCode, String error) {
        SQLiteDatabase db = getWritableDatabase();
        ensureState(db, deviceCode);
        ContentValues values = new ContentValues();
        values.put("last_error", truncate(error, 500));
        values.put("last_error_at_ms", System.currentTimeMillis());
        db.update(TABLE_STATE, values, "device_code = ?", new String[]{deviceCode});
    }

    public synchronized StatusSnapshot getStatusSnapshot() {
        int pending = countPending();
        DeviceStatus entry = getDeviceStatus("workshop-entry");
        DeviceStatus exit = getDeviceStatus("workshop-exit");
        String latestError = "";
        long errorAt = 0;
        if (entry.lastErrorAtMs > errorAt && !entry.lastError.isEmpty()) {
            latestError = entry.lastError;
            errorAt = entry.lastErrorAtMs;
        }
        if (exit.lastErrorAtMs > errorAt && !exit.lastError.isEmpty()) {
            latestError = exit.lastError;
        }
        return new StatusSnapshot(pending, entry, exit, latestError);
    }

    private DeviceStatus getDeviceStatus(String deviceCode) {
        SQLiteDatabase db = getReadableDatabase();
        ensureState(db, deviceCode);
        try (Cursor cursor = db.query(
                TABLE_STATE,
                null,
                "device_code = ?",
                new String[]{deviceCode},
                null,
                null,
                null,
                "1"
        )) {
            if (!cursor.moveToFirst()) return new DeviceStatus(0, 0, 0, "");
            return new DeviceStatus(
                    cursor.getLong(cursor.getColumnIndexOrThrow("last_read_at_ms")),
                    cursor.getLong(cursor.getColumnIndexOrThrow("last_upload_at_ms")),
                    cursor.getLong(cursor.getColumnIndexOrThrow("last_error_at_ms")),
                    nullableString(cursor, "last_error") == null
                            ? ""
                            : nullableString(cursor, "last_error")
            );
        }
    }

    private long stateLong(String deviceCode, String column) {
        SQLiteDatabase db = getReadableDatabase();
        ensureState(db, deviceCode);
        try (Cursor cursor = db.query(
                TABLE_STATE,
                new String[]{column},
                "device_code = ?",
                new String[]{deviceCode},
                null,
                null,
                null,
                "1"
        )) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    private static void ensureState(SQLiteDatabase db, String deviceCode) {
        ContentValues values = new ContentValues();
        values.put("device_code", deviceCode);
        db.insertWithOnConflict(
                TABLE_STATE,
                null,
                values,
                SQLiteDatabase.CONFLICT_IGNORE
        );
    }

    private static void putNullable(ContentValues values, String key, String value) {
        if (value == null) values.putNull(key);
        else values.put(key, value);
    }

    private static void putNullable(ContentValues values, String key, Integer value) {
        if (value == null) values.putNull(key);
        else values.put(key, value);
    }

    private static String nullableString(Cursor cursor, String column) {
        int index = cursor.getColumnIndexOrThrow(column);
        return cursor.isNull(index) ? null : cursor.getString(index);
    }

    private static Integer nullableInteger(Cursor cursor, String column) {
        int index = cursor.getColumnIndexOrThrow(column);
        return cursor.isNull(index) ? null : cursor.getInt(index);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return "Unknown error";
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public static final class DeviceStatus {
        public final long lastReadAtMs;
        public final long lastUploadAtMs;
        public final long lastErrorAtMs;
        public final String lastError;

        public DeviceStatus(
                long lastReadAtMs,
                long lastUploadAtMs,
                long lastErrorAtMs,
                String lastError
        ) {
            this.lastReadAtMs = lastReadAtMs;
            this.lastUploadAtMs = lastUploadAtMs;
            this.lastErrorAtMs = lastErrorAtMs;
            this.lastError = lastError;
        }
    }

    public static final class StatusSnapshot {
        public final int pendingCount;
        public final DeviceStatus entry;
        public final DeviceStatus exit;
        public final String latestError;

        public StatusSnapshot(
                int pendingCount,
                DeviceStatus entry,
                DeviceStatus exit,
                String latestError
        ) {
            this.pendingCount = pendingCount;
            this.entry = entry;
            this.exit = exit;
            this.latestError = latestError;
        }
    }
}
