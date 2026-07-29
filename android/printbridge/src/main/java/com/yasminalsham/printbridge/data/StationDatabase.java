package com.yasminalsham.printbridge.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.yasminalsham.printbridge.model.ClaimedJob;

import java.util.ArrayList;
import java.util.List;

public final class StationDatabase extends SQLiteOpenHelper {
    private static final String DATABASE_NAME = "print_station.db";
    private static final int DATABASE_VERSION = 1;
    private static final String TABLE_JOBS = "local_print_jobs";

    public StationDatabase(Context context) {
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
                "CREATE TABLE " + TABLE_JOBS + " ("
                        + "job_id TEXT PRIMARY KEY,"
                        + "job_token TEXT NOT NULL,"
                        + "job_type TEXT NOT NULL,"
                        + "payload_json TEXT NOT NULL,"
                        + "open_cash_drawer INTEGER NOT NULL DEFAULT 0,"
                        + "state TEXT NOT NULL,"
                        + "bytes_sent INTEGER NOT NULL DEFAULT 0,"
                        + "last_error TEXT,"
                        + "updated_at_ms INTEGER NOT NULL"
                        + ")"
        );
        db.execSQL(
                "CREATE INDEX idx_local_print_jobs_state_updated "
                        + "ON " + TABLE_JOBS + "(state, updated_at_ms)"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException(
                "Unsupported print station database upgrade " + oldVersion + " -> " + newVersion
        );
    }

    public synchronized LocalPrintJob saveClaim(ClaimedJob job) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            LocalPrintJob existing = getJob(db, job.id);
            if (existing != null && (
                    existing.state == LocalJobState.DISPATCHING
                            || existing.state == LocalJobState.SENT_AWAITING_ACK
                            || existing.state == LocalJobState.UNCERTAIN
                            || existing.state == LocalJobState.DONE
            )) {
                db.setTransactionSuccessful();
                return existing;
            }

            ContentValues values = new ContentValues();
            values.put("job_id", job.id);
            values.put("job_token", job.jobToken);
            values.put("job_type", job.jobType);
            values.put("payload_json", job.payload.toString());
            values.put("open_cash_drawer", job.openCashDrawer ? 1 : 0);
            values.put("state", LocalJobState.CLAIMED.name());
            values.put("bytes_sent", 0);
            values.putNull("last_error");
            values.put("updated_at_ms", System.currentTimeMillis());
            db.insertWithOnConflict(
                    TABLE_JOBS,
                    null,
                    values,
                    SQLiteDatabase.CONFLICT_REPLACE
            );
            db.setTransactionSuccessful();
            return getJob(db, job.id);
        } finally {
            db.endTransaction();
        }
    }

    public synchronized void markDispatching(String jobId) {
        updateState(jobId, LocalJobState.DISPATCHING, 0, null);
    }

    public synchronized void updateBytesSent(String jobId, int bytesSent) {
        ContentValues values = new ContentValues();
        values.put("bytes_sent", Math.max(0, bytesSent));
        values.put("updated_at_ms", System.currentTimeMillis());
        getWritableDatabase().update(TABLE_JOBS, values, "job_id = ?", new String[]{jobId});
    }

    public synchronized void markSentAwaitingAck(String jobId, int bytesSent) {
        updateState(jobId, LocalJobState.SENT_AWAITING_ACK, bytesSent, null);
    }

    public synchronized void markUncertain(String jobId, int bytesSent, String error) {
        updateState(jobId, LocalJobState.UNCERTAIN, bytesSent, error);
    }

    public synchronized void markDone(String jobId) {
        updateState(jobId, LocalJobState.DONE, -1, null);
    }

    public synchronized void deleteJob(String jobId) {
        getWritableDatabase().delete(
                TABLE_JOBS,
                "job_id = ?",
                new String[]{jobId}
        );
    }

    public synchronized List<LocalPrintJob> getOutstandingJobs() {
        ArrayList<LocalPrintJob> jobs = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                TABLE_JOBS,
                null,
                "state IN (?,?,?)",
                new String[]{
                        LocalJobState.DISPATCHING.name(),
                        LocalJobState.SENT_AWAITING_ACK.name(),
                        LocalJobState.UNCERTAIN.name()
                },
                null,
                null,
                "updated_at_ms ASC"
        )) {
            while (cursor.moveToNext()) jobs.add(fromCursor(cursor));
        }
        return jobs;
    }

    public synchronized int countByState(LocalJobState state) {
        try (Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM " + TABLE_JOBS + " WHERE state = ?",
                new String[]{state.name()}
        )) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    public synchronized void pruneCompletedJobs(long olderThanMs) {
        getWritableDatabase().delete(
                TABLE_JOBS,
                "state = ? AND updated_at_ms < ?",
                new String[]{LocalJobState.DONE.name(), String.valueOf(olderThanMs)}
        );
    }

    private void updateState(
            String jobId,
            LocalJobState state,
            int bytesSent,
            String lastError
    ) {
        ContentValues values = new ContentValues();
        values.put("state", state.name());
        if (bytesSent >= 0) values.put("bytes_sent", bytesSent);
        if (lastError == null) values.putNull("last_error");
        else values.put("last_error", truncate(lastError, 500));
        values.put("updated_at_ms", System.currentTimeMillis());
        getWritableDatabase().update(TABLE_JOBS, values, "job_id = ?", new String[]{jobId});
    }

    private LocalPrintJob getJob(SQLiteDatabase db, String jobId) {
        try (Cursor cursor = db.query(
                TABLE_JOBS,
                null,
                "job_id = ?",
                new String[]{jobId},
                null,
                null,
                null,
                "1"
        )) {
            return cursor.moveToFirst() ? fromCursor(cursor) : null;
        }
    }

    private static LocalPrintJob fromCursor(Cursor cursor) {
        String stateValue = cursor.getString(cursor.getColumnIndexOrThrow("state"));
        LocalJobState state;
        try {
            state = LocalJobState.valueOf(stateValue);
        } catch (IllegalArgumentException error) {
            state = LocalJobState.UNCERTAIN;
        }
        return new LocalPrintJob(
                cursor.getString(cursor.getColumnIndexOrThrow("job_id")),
                cursor.getString(cursor.getColumnIndexOrThrow("job_token")),
                cursor.getString(cursor.getColumnIndexOrThrow("job_type")),
                cursor.getString(cursor.getColumnIndexOrThrow("payload_json")),
                cursor.getInt(cursor.getColumnIndexOrThrow("open_cash_drawer")) != 0,
                state,
                cursor.getInt(cursor.getColumnIndexOrThrow("bytes_sent")),
                cursor.isNull(cursor.getColumnIndexOrThrow("last_error"))
                        ? ""
                        : cursor.getString(cursor.getColumnIndexOrThrow("last_error")),
                cursor.getLong(cursor.getColumnIndexOrThrow("updated_at_ms"))
        );
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value;
        return value.substring(0, maxLength);
    }
}
