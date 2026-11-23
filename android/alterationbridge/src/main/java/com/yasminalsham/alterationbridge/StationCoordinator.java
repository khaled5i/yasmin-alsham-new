package com.yasminalsham.alterationbridge;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.SystemClock;

import com.yasminalsham.alterationbridge.api.ApiException;
import com.yasminalsham.alterationbridge.api.StationApiClient;
import com.yasminalsham.alterationbridge.config.StationPreferences;
import com.yasminalsham.alterationbridge.data.LocalJobState;
import com.yasminalsham.alterationbridge.data.LocalPrintJob;
import com.yasminalsham.alterationbridge.data.StationDatabase;
import com.yasminalsham.alterationbridge.model.ClaimedJob;
import com.yasminalsham.alterationbridge.model.StationStatus;
import com.yasminalsham.alterationbridge.model.AlterationSlipPayload;
import com.yasminalsham.alterationbridge.model.InvoiceReceiptPayload;
import com.yasminalsham.alterationbridge.network.NetworkMonitor;
import com.yasminalsham.alterationbridge.print.EscPosEncoder;
import com.yasminalsham.alterationbridge.print.PrinterException;
import com.yasminalsham.alterationbridge.print.PrinterTransport;
import com.yasminalsham.alterationbridge.print.AlterationSlipRenderer;
import com.yasminalsham.alterationbridge.print.InvoiceReceiptRenderer;

import org.json.JSONException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public final class StationCoordinator implements AutoCloseable {
    private static final long PRINTER_PROBE_INTERVAL_MS = 15_000;
    private static final long COMPLETED_RETENTION_MS = 7L * 24 * 60 * 60 * 1000;

    private final StationPreferences preferences;
    private final StationDatabase database;
    private final StationApiClient api;
    private final PrinterTransport printerTransport;
    private final AlterationSlipRenderer renderer;
    private final InvoiceReceiptRenderer invoiceRenderer;
    private final NetworkMonitor networkMonitor;
    private final Listener listener;
    private final ScheduledExecutorService scheduler;
    private final ScheduledExecutorService printExecutor;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean processingJob = new AtomicBoolean(false);
    private final AtomicReference<String> currentJobId = new AtomicReference<>("");
    private final AtomicReference<StationStatus> status =
            new AtomicReference<>(StationStatus.initial());

    private final Object scheduleLock = new Object();
    private ScheduledFuture<?> nextTick;
    private long tickSequence;
    private boolean wakeRequested;
    private volatile long generation;
    private volatile boolean printerReachable;
    private volatile String lastError = "";
    private volatile long lastPrinterProbeElapsed;
    private int consecutiveFailures;

    public StationCoordinator(Context context, Listener listener) {
        Context appContext = context.getApplicationContext();
        this.preferences = new StationPreferences(appContext);
        this.database = new StationDatabase(appContext);
        this.api = new StationApiClient();
        this.printerTransport = new PrinterTransport();
        this.renderer = new AlterationSlipRenderer();
        this.invoiceRenderer = new InvoiceReceiptRenderer();
        this.listener = listener;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(
                namedThreadFactory("station-heartbeat")
        );
        this.printExecutor = Executors.newSingleThreadScheduledExecutor(
                namedThreadFactory("station-printer")
        );
        this.networkMonitor = new NetworkMonitor(appContext, this::wakeNow);
    }

    public void start() {
        if (!running.compareAndSet(false, true)) return;
        database.pruneCompletedJobs(System.currentTimeMillis() - COMPLETED_RETENTION_MS);
        networkMonitor.start();
        wakeNow();
    }

    public StationStatus getStatus() {
        return status.get();
    }

    public int getLocalUnknownCount() {
        return database.countByState(LocalJobState.UNCERTAIN);
    }

    public void configurationChanged() {
        lastError = "";
        printerReachable = false;
        lastPrinterProbeElapsed = 0;
        consecutiveFailures = 0;
        wakeNow();
    }

    public void stop(boolean releaseLease) {
        if (!running.compareAndSet(true, false)) return;
        cancelNextTick();
        networkMonitor.close();
        printerTransport.cancelActive();

        StationPreferences.PairingCredentials credentials = preferences.getCredentials();
        long releaseGeneration = generation;
        if (releaseLease && credentials != null && releaseGeneration > 0 && api.isConfigured()) {
            scheduler.execute(() -> {
                try {
                    api.release(credentials, releaseGeneration);
                } catch (Exception ignored) {
                }
            });
        }
        scheduler.shutdown();
        printExecutor.shutdownNow();
        publish(status.get().withRuntime(StationStatus.Role.STOPPED, false, lastError));
    }

    @Override
    public void close() {
        stop(true);
        database.close();
    }

    private void tick() {
        if (!running.get()) return;

        StationPreferences.PairingCredentials credentials = preferences.getCredentials();
        if (credentials == null) {
            publish(status.get().withRuntime(
                    StationStatus.Role.UNPAIRED,
                    false,
                    "أدخل رمز ربط المحطة"
            ));
            scheduleNext(5_000);
            return;
        }
        if (!api.isConfigured()) {
            publish(status.get().withRuntime(
                    StationStatus.Role.OFFLINE,
                    false,
                    "نسخة التطبيق لا تحتوي إعداد اتصال Supabase"
            ));
            scheduleNext(30_000);
            return;
        }
        // لا ننتظر علامة «الإنترنت مُتحقَّق منه» من أندرويد: كثير من الراوترات
        // تُفشل فحص Google للاتصال لدقائق بينما Supabase يعمل، فكانت المحطة
        // تتوقف كليًا بلا سبب حقيقي. نداء الخادم نفسه هو الاختبار الصادق.
        if (!networkMonitor.hasAnyNetwork()) {
            publish(status.get().withRuntime(
                    StationStatus.Role.OFFLINE,
                    printerReachable,
                    "لا يوجد اتصال بالشبكة"
            ));
            scheduleNext(nextFailureDelay());
            return;
        }

        try {
            recoverOutstanding(credentials);
            probePrinterIfDue();
            StationStatus heartbeat = api.heartbeat(
                    credentials,
                    preferences.getPrinterIp(),
                    printerReachable,
                    lastError
            );
            generation = heartbeat.generation;
            consecutiveFailures = 0;
            if (printerReachable) lastError = "";
            StationStatus cleanHeartbeat = heartbeat.withRuntime(
                    heartbeat.role,
                    printerReachable,
                    lastError
            );
            publish(cleanHeartbeat);

            if (cleanHeartbeat.role == StationStatus.Role.ACTIVE && !processingJob.get()) {
                claimAndSubmit(credentials, heartbeat.generation);
            }
            scheduleNext(heartbeat.pollAfterMs);
        } catch (ApiException error) {
            lastError = safeError(error);
            publish(status.get().withRuntime(
                    StationStatus.Role.OFFLINE,
                    printerReachable,
                    lastError
            ));
            scheduleNext(nextFailureDelay());
        } catch (Exception error) {
            lastError = safeError(error);
            publish(status.get().withRuntime(
                    StationStatus.Role.OFFLINE,
                    printerReachable,
                    lastError
            ));
            scheduleNext(nextFailureDelay());
        }
    }

    private void claimAndSubmit(
            StationPreferences.PairingCredentials credentials,
            long claimedGeneration
    ) throws ApiException {
        ClaimedJob claimed = api.claimJob(credentials, claimedGeneration);
        if (claimed == null) return;

        LocalPrintJob local = database.saveClaim(claimed);
        if (local == null) {
            reportSafeFailure(
                    credentials,
                    claimed,
                    "local_storage_failed",
                    "تعذّر حفظ مهمة الطباعة محليًا"
            );
            return;
        }
        if (local.state == LocalJobState.SENT_AWAITING_ACK) {
            retryCompletion(credentials, local);
            return;
        }
        if (local.state != LocalJobState.CLAIMED) {
            // المهمة نفسها وبالرمز نفسه، لكن هذا التابلت قد يكون أرسلها للطابعة
            // سابقًا. لا نطبعها (منعًا للتكرار)، لكن لا نتركها محجوزة عندنا على
            // الخادم أيضًا: كان ذلك يعيدها مع كل استلام فيتوقف الطابور خلفها.
            releaseLocallyUncertainClaim(credentials, local);
            return;
        }
        if (!processingJob.compareAndSet(false, true)) return;

        currentJobId.set(claimed.id);
        printExecutor.execute(() -> {
            try {
                processClaimedJob(credentials, claimed, claimedGeneration);
            } catch (Throwable error) {
                lastError = safeError(error);
            } finally {
                currentJobId.set("");
                processingJob.set(false);
                wakeNow();
            }
        });
    }

    private void processClaimedJob(
            StationPreferences.PairingCredentials credentials,
            ClaimedJob job,
            long claimedGeneration
    ) {
        byte[] printBytes;
        try {
            printBytes = buildPrintBytes(job);
        } catch (Throwable error) {
            // Throwable لا Exception: نفاد الذاكرة أثناء رسم ورقة طويلة كان يفلت
            // من هنا، فتبقى المهمة محجوزة ثم تعود للطابور بلا احتساب محاولة،
            // وتتكرر إلى الأبد أمام كل المهام التي بعدها.
            reportSafeFailure(
                    credentials,
                    job,
                    error instanceof PrinterException
                            ? ((PrinterException) error).code
                            : error instanceof OutOfMemoryError
                            ? "render_out_of_memory"
                            : "invalid_payload",
                    safeError(error)
            );
            return;
        }

        PrinterTransport.Connection connection = null;
        boolean beginAccepted = false;
        try {
            connection = printerTransport.connect(
                    preferences.getPrinterIp(),
                    networkMonitor.getWifiNetwork()
            );

            StationStatus current = status.get();
            if (!running.get()
                    || current.role != StationStatus.Role.ACTIVE
                    || current.generation != claimedGeneration) {
                reportSafeFailure(
                        credentials,
                        job,
                        "leadership_lost_before_begin",
                        "فقدت المحطة الدور النشط قبل بدء الإرسال"
                );
                return;
            }

            beginAccepted = api.beginSend(
                    credentials,
                    claimedGeneration,
                    job.id,
                    job.jobToken
            );
            if (!beginAccepted) {
                database.deleteJob(job.id);
                emitEvent("رفض الخادم بدء طباعة المهمة " + shortId(job.id));
                return;
            }

            database.markDispatching(job.id);
            int sent = connection.send(
                    printBytes,
                    bytesSent -> database.updateBytesSent(job.id, bytesSent)
            );
            database.markSentAwaitingAck(job.id, sent);
            printerReachable = true;
            // طباعة ناجحة = فحص ناجح؛ لا نفتح اتصالًا إضافيًا والطابعة ما زالت تُخرج الورقة.
            lastPrinterProbeElapsed = SystemClock.elapsedRealtime();
            lastError = "";

            try {
                if (api.completeJob(credentials, job.id, job.jobToken)) {
                    database.markDone(job.id);
                    emitEvent("تمت طباعة المهمة " + shortId(job.id));
                } else {
                    database.markUncertain(
                            job.id,
                            sent,
                            "رفض الخادم تأكيد اكتمال مهمة مطبوعة"
                    );
                    emitEvent("المهمة مطبوعة لكن تأكيدها غير معروف " + shortId(job.id));
                }
            } catch (ApiException error) {
                // SENT_AWAITING_ACK remains durable. Recovery retries only the ACK.
                lastError = safeError(error);
                emitEvent("ستُعاد محاولة تأكيد المهمة " + shortId(job.id));
            }
        } catch (PrinterException error) {
            printerReachable = false;
            lastError = safeError(error);
            if (!beginAccepted) {
                reportSafeFailure(credentials, job, error.code, lastError);
            } else {
                reportUncertainFailure(
                        credentials,
                        job,
                        Math.max(1, error.bytesSent),
                        error.code,
                        lastError
                );
            }
        } catch (ApiException error) {
            lastError = safeError(error);
            if (beginAccepted) {
                reportUncertainFailure(
                        credentials,
                        job,
                        1,
                        error.code,
                        lastError
                );
            } else {
                reportSafeFailure(credentials, job, error.code, lastError);
            }
        } catch (RuntimeException error) {
            lastError = safeError(error);
            if (beginAccepted) {
                reportUncertainFailure(
                        credentials,
                        job,
                        1,
                        "station_runtime_error_after_begin",
                        lastError
                );
            } else {
                reportSafeFailure(
                        credentials,
                        job,
                        "station_runtime_error",
                        lastError
                );
            }
        } finally {
            printerTransport.release(connection);
        }
    }

    private byte[] buildPrintBytes(ClaimedJob job)
            throws JSONException, PrinterException {
        if (ClaimedJob.TYPE_WOMEN_WORKSHOP_RECEIPT.equals(job.jobType)) {
            InvoiceReceiptPayload invoice = InvoiceReceiptPayload.fromJson(job.payload);
            Bitmap paper = invoiceRenderer.render(invoice);
            List<Bitmap> papers = java.util.Collections.singletonList(paper);
            try {
                return EscPosEncoder.encodeSlips(papers);
            } finally {
                paper.recycle();
            }
        }

        AlterationSlipPayload payload = AlterationSlipPayload.fromJson(job.payload);
        List<Bitmap> slips = renderer.render(payload);
        try {
            return EscPosEncoder.encodeSlips(slips);
        } finally {
            for (Bitmap slip : slips) slip.recycle();
        }
    }

    private void recoverOutstanding(
            StationPreferences.PairingCredentials credentials
    ) {
        List<LocalPrintJob> jobs = database.getOutstandingJobs();
        String inFlightJob = currentJobId.get();
        for (LocalPrintJob job : jobs) {
            if (job.jobId.equals(inFlightJob)) continue;
            try {
                if (job.state == LocalJobState.SENT_AWAITING_ACK) {
                    retryCompletion(credentials, job);
                } else if (job.state == LocalJobState.DISPATCHING) {
                    StationApiClient.FailResult result = api.failJob(
                            credentials,
                            job.jobId,
                            job.jobToken,
                            Math.max(1, job.bytesSent),
                            "station_restarted_after_begin",
                            "أُعيد تشغيل محطة الطباعة بعد بدء الإرسال؛ النتيجة غير مؤكدة"
                    );
                    if (isPending(result.status)) {
                        database.deleteJob(job.jobId);
                    } else {
                        database.markUncertain(
                                job.jobId,
                                Math.max(1, job.bytesSent),
                                "انقطاع المحطة بعد بدء الإرسال"
                        );
                    }
                }
            } catch (ApiException error) {
                lastError = safeError(error);
            }
        }
    }

    private void retryCompletion(
            StationPreferences.PairingCredentials credentials,
            LocalPrintJob job
    ) throws ApiException {
        if (api.completeJob(credentials, job.jobId, job.jobToken)) {
            database.markDone(job.jobId);
        }
    }

    private void releaseLocallyUncertainClaim(
            StationPreferences.PairingCredentials credentials,
            LocalPrintJob local
    ) {
        int bytesSent = Math.max(1, local.bytesSent);
        try {
            StationApiClient.FailResult result = api.failJob(
                    credentials,
                    local.jobId,
                    local.jobToken,
                    bytesSent,
                    "station_local_outcome_unknown",
                    "سبق أن أرسل هذا التابلت المهمة للطابعة؛ افحص الورق ثم أعد الطباعة عند الحاجة"
            );
            if (isPending(result.status)) database.deleteJob(local.jobId);
        } catch (ApiException error) {
            lastError = safeError(error);
        }
        emitEvent("مهمة غير مؤكدة تنتظر قرار المدير " + shortId(local.jobId));
    }

    private void reportSafeFailure(
            StationPreferences.PairingCredentials credentials,
            ClaimedJob job,
            String code,
            String message
    ) {
        try {
            StationApiClient.FailResult result = api.failJob(
                    credentials,
                    job.id,
                    job.jobToken,
                    0,
                    code,
                    message
            );
            if (isPending(result.status)) {
                database.deleteJob(job.id);
            } else if ("unknown".equalsIgnoreCase(result.status)) {
                database.markUncertain(job.id, 0, message);
            }
        } catch (ApiException ignored) {
            // No byte was sent and begin_send was not accepted. A future server
            // claim can safely replace this local CLAIMED row with a new token.
        }
        emitEvent("تعذّرت المهمة قبل بدء الطباعة " + shortId(job.id));
    }

    private void reportUncertainFailure(
            StationPreferences.PairingCredentials credentials,
            ClaimedJob job,
            int conservativeBytesSent,
            String code,
            String message
    ) {
        int bytesSent = Math.max(1, conservativeBytesSent);
        database.markUncertain(job.id, bytesSent, message);
        try {
            StationApiClient.FailResult result = api.failJob(
                    credentials,
                    job.id,
                    job.jobToken,
                    bytesSent,
                    code,
                    message
            );
            if (isPending(result.status)) {
                // The server is authoritative. This permits a fresh token to replace
                // the old row, although normal server policy keeps post-begin failures unknown.
                database.deleteJob(job.id);
            }
        } catch (ApiException ignored) {
            // Keep UNCERTAIN locally; it must never be sent to the printer again.
        }
        emitEvent("نتيجة الطباعة غير مؤكدة " + shortId(job.id));
    }

    private void probePrinterIfDue() {
        if (processingJob.get()) return;
        long now = SystemClock.elapsedRealtime();
        if (lastPrinterProbeElapsed != 0
                && now - lastPrinterProbeElapsed < PRINTER_PROBE_INTERVAL_MS) {
            return;
        }
        lastPrinterProbeElapsed = now;
        String printerIp = preferences.getPrinterIp();
        boolean reachable = printerTransport.probe(
                printerIp,
                networkMonitor.getWifiNetwork(),
                1_500
        );
        if (!reachable) {
            // فحص واحد فاشل (الطابعة ما زالت تُنهي ورقة، أو تذبذب لحظي في Wi-Fi)
            // كان يُسقط المحطة من الدور النشط 15 ثانية على الأقل. نعيد المحاولة
            // مرة بمهلة أطول قبل الحكم بأن الطابعة غير متاحة.
            SystemClock.sleep(800);
            reachable = printerTransport.probe(
                    printerIp,
                    networkMonitor.getWifiNetwork(),
                    3_000
            );
        }
        printerReachable = reachable;
        if (!printerReachable) lastError = "الطابعة غير متاحة على الشبكة";
    }

    /*
     * سلسلة دورات واحدة فقط في أي لحظة.
     *
     * النسخة السابقة كانت تلغي «الدورة التالية» ثم تجدول دورة فورية، لكن إذا
     * وصل الإيقاظ (تغيّر الشبكة، أو انتهاء مهمة طباعة) أثناء تنفيذ دورة، كانت
     * الدورة الجارية تجدول تاليتها أيضًا، فتعيش سلسلتان. ومع كل إيقاظ كهذا
     * تزيد السلاسل ولا تنقص، فتتضاعف نداءات الخادم على خيط واحد حتى تتأخر
     * الطباعة دقائق، ولا يحلّها إلا إعادة تشغيل التطبيق.
     *
     * الآن لكل جدولة رقم تسلسلي، وأي دورة رقمها قديم تخرج فورًا. والإيقاظ
     * الذي يصل أثناء دورة جارية لا يضيع: تجدول الدورة الجارية تاليتها فورًا.
     */
    private void wakeNow() {
        if (!running.get()) return;
        synchronized (scheduleLock) {
            wakeRequested = true;
            scheduleTickLocked(0);
        }
    }

    private void scheduleNext(long delayMs) {
        if (!running.get()) return;
        synchronized (scheduleLock) {
            scheduleTickLocked(wakeRequested ? 0 : Math.max(500, delayMs));
        }
    }

    private void scheduleTickLocked(long delayMs) {
        if (!running.get()) return;
        if (nextTick != null) nextTick.cancel(false);
        final long sequence = ++tickSequence;
        try {
            nextTick = scheduler.schedule(
                    () -> runTick(sequence),
                    Math.max(0, delayMs),
                    TimeUnit.MILLISECONDS
            );
        } catch (RuntimeException ignored) {
            // The scheduler is shutting down.
        }
    }

    private void runTick(long sequence) {
        synchronized (scheduleLock) {
            if (!running.get() || sequence != tickSequence) return;
            wakeRequested = false;
        }
        try {
            tick();
        } catch (Throwable error) {
            // أي استثناء غير متوقع كان يُبتلع داخل المُجدول فتموت الحلقة بصمت
            // وتتوقف المحطة نهائيًا مع بقاء الإشعار «تعمل».
            lastError = safeError(error);
        } finally {
            synchronized (scheduleLock) {
                if (running.get() && sequence == tickSequence) {
                    scheduleTickLocked(nextFailureDelay());
                }
            }
        }
    }

    private void cancelNextTick() {
        synchronized (scheduleLock) {
            tickSequence++;
            if (nextTick != null) nextTick.cancel(false);
            nextTick = null;
        }
    }

    private long nextFailureDelay() {
        consecutiveFailures = Math.min(6, consecutiveFailures + 1);
        long base = Math.min(30_000, 1_000L << Math.min(5, consecutiveFailures - 1));
        long jitter = (long) (Math.random() * Math.max(1, base / 5));
        return base + jitter;
    }

    private void publish(StationStatus next) {
        StationStatus combined = next.withUnknownCount(Math.max(
                next.unknownCount,
                database.countByState(LocalJobState.UNCERTAIN)
        ));
        status.set(combined);
        if (listener != null) listener.onStatusChanged(combined);
    }

    private void emitEvent(String message) {
        if (listener != null) listener.onEvent(message);
    }

    private static boolean isPending(String status) {
        if (status == null) return false;
        String normalized = status.trim().toLowerCase(Locale.ROOT);
        return "pending".equals(normalized) || "retry".equals(normalized);
    }

    private static String safeError(Throwable error) {
        String message = error == null ? "" : error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            message = error == null ? "خطأ غير معروف" : error.getClass().getSimpleName();
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    private static String shortId(String id) {
        if (id == null) return "";
        return id.length() <= 8 ? id : id.substring(0, 8);
    }

    private static ThreadFactory namedThreadFactory(String name) {
        return runnable -> {
            Thread thread = new Thread(runnable, name);
            thread.setPriority(Thread.NORM_PRIORITY);
            return thread;
        };
    }

    public interface Listener {
        void onStatusChanged(StationStatus status);

        void onEvent(String message);
    }
}
