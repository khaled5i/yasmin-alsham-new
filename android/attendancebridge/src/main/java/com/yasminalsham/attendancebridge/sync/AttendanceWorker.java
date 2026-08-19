package com.yasminalsham.attendancebridge.sync;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.yasminalsham.attendancebridge.config.AttendancePreferences;

public final class AttendanceWorker extends Worker {
    public AttendanceWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        AttendancePreferences preferences = new AttendancePreferences(getApplicationContext());
        if (!preferences.isEnabled() || !preferences.hasCompleteConfiguration()) {
            return Result.success();
        }
        AttendanceSynchronizer.SyncRunResult result =
                new AttendanceSynchronizer(getApplicationContext()).runOnce();
        return result.shouldRetry ? Result.retry() : Result.success();
    }
}
