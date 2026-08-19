package com.yasminalsham.attendancebridge.sync;

import android.content.Context;

import androidx.work.BackoffPolicy;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public final class SyncScheduler {
    private static final String PERIODIC_WORK_NAME = "yasmin-attendance-periodic";
    private static final String IMMEDIATE_WORK_NAME = "yasmin-attendance-immediate";

    private SyncScheduler() {
    }

    public static void schedule(Context context) {
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                AttendanceWorker.class,
                15,
                TimeUnit.MINUTES
        )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                periodic
        );
    }

    public static void enqueueImmediate(Context context) {
        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(AttendanceWorker.class)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                immediate
        );
    }

    public static void cancel(Context context) {
        WorkManager manager = WorkManager.getInstance(context.getApplicationContext());
        manager.cancelUniqueWork(PERIODIC_WORK_NAME);
        manager.cancelUniqueWork(IMMEDIATE_WORK_NAME);
    }
}
