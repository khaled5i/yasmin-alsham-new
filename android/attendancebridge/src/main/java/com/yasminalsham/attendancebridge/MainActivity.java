package com.yasminalsham.attendancebridge;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import com.yasminalsham.attendancebridge.config.AttendancePreferences;
import com.yasminalsham.attendancebridge.data.AttendanceDatabase;
import com.yasminalsham.attendancebridge.network.AttendanceApiClient;
import com.yasminalsham.attendancebridge.sync.AttendanceSyncService;
import com.yasminalsham.attendancebridge.sync.SyncScheduler;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@SuppressLint("SetTextI18n")
public final class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 2001;

    private AttendancePreferences preferences;
    private AttendanceDatabase database;
    private EditText siteUrlInput;
    private EditText ingestSecretInput;
    private EditText entryAddressInput;
    private EditText entryUsernameInput;
    private EditText entryPasswordInput;
    private EditText exitAddressInput;
    private EditText exitUsernameInput;
    private EditText exitPasswordInput;
    private TextView statusTitle;
    private TextView statusDetail;
    private TextView queueText;
    private TextView devicesText;
    private Button saveButton;
    private final ExecutorService configurationExecutor = Executors.newSingleThreadExecutor();

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshStatus();
            String message = intent.getStringExtra(AttendanceSyncService.EXTRA_MESSAGE);
            if (message != null && !message.trim().isEmpty()) statusDetail.setText(message);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = new AttendancePreferences(this);
        database = new AttendanceDatabase(this);
        getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        setContentView(buildContentView());
        registerStatusReceiver();
        requestNotificationPermissionIfNeeded();

        if (preferences.isEnabled() && preferences.hasCompleteConfiguration()) {
            SyncScheduler.schedule(this);
            startServiceAction(AttendanceSyncService.ACTION_START);
        }
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(statusReceiver);
        } catch (IllegalArgumentException ignored) {
        }
        configurationExecutor.shutdownNow();
        if (database != null) database.close();
        super.onDestroy();
    }

    private View buildContentView() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(22), dp(18), dp(34));
        content.setBackgroundColor(Color.parseColor("#F7F3EE"));

        TextView eyebrow = text("ياسمين الشام · محطة الورشة", 13, true, "#7F1D1D");
        eyebrow.setGravity(Gravity.CENTER);
        content.addView(eyebrow, marginParams(0, dp(5)));

        TextView title = text("مزامنة الحضور والانصراف", 25, true, "#1C1917");
        title.setGravity(Gravity.CENTER);
        content.addView(title, marginParams(0, dp(7)));

        TextView subtitle = text(
                "تقرأ السجلات من جهازي Dahua داخل شبكة الورشة وتحفظها حتى عودة الإنترنت",
                14,
                false,
                "#57534E"
        );
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setLineSpacing(0, 1.18f);
        content.addView(subtitle, marginParams(0, dp(18)));

        LinearLayout statusCard = card("#FFFFFF", "#E7E5E4");
        statusTitle = text("", 20, true, "#1C1917");
        statusTitle.setGravity(Gravity.CENTER);
        statusCard.addView(statusTitle, marginParams(0, dp(6)));
        statusDetail = text("", 14, false, "#57534E");
        statusDetail.setGravity(Gravity.CENTER);
        statusDetail.setLineSpacing(0, 1.15f);
        statusCard.addView(statusDetail, marginParams(0, dp(8)));
        queueText = text("", 14, true, "#7F1D1D");
        queueText.setGravity(Gravity.CENTER);
        statusCard.addView(queueText, marginParams(0, dp(9)));
        devicesText = text("", 12, false, "#78716C");
        devicesText.setGravity(Gravity.CENTER);
        devicesText.setLineSpacing(0, 1.25f);
        statusCard.addView(devicesText, marginParams(0, 0));
        content.addView(statusCard, marginParams(0, dp(18)));

        LinearLayout serverCard = card("#FFFBF5", "#E7D7C6");
        serverCard.addView(sectionTitle("اتصال الموقع"), marginParams(0, dp(12)));
        siteUrlInput = field(
                "رابط الموقع المنشور",
                preferences.getSiteUrl(),
                false,
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
        );
        serverCard.addView(siteUrlInput, marginParams(0, dp(12)));
        ingestSecretInput = field(
                "المفتاح السري — اتركه فارغًا إذا كان محفوظًا",
                "",
                true,
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );
        serverCard.addView(ingestSecretInput, marginParams(0, 0));
        content.addView(serverCard, marginParams(0, dp(14)));

        LinearLayout entryCard = deviceCard(true);
        content.addView(entryCard, marginParams(0, dp(14)));
        LinearLayout exitCard = deviceCard(false);
        content.addView(exitCard, marginParams(0, dp(18)));

        saveButton = button("حفظ واختبار المفتاح", "#7F1D1D", "#FFFFFF");
        saveButton.setOnClickListener(view -> saveAndStart());
        content.addView(saveButton, marginParams(0, dp(10)));

        Button syncButton = button("مزامنة الآن", "#D6B98C", "#292524");
        syncButton.setOnClickListener(view -> syncNow());
        content.addView(syncButton, marginParams(0, dp(10)));

        Button stopButton = button("إيقاف المزامنة مؤقتًا", "#E7E5E4", "#44403C");
        stopButton.setOnClickListener(view -> stopSync());
        content.addView(stopButton, marginParams(0, dp(10)));

        Button batteryButton = button("فتح إعدادات البطارية", "#FFFFFF", "#57534E");
        batteryButton.setOnClickListener(view -> openBatterySettings());
        content.addView(batteryButton, marginParams(0, dp(20)));

        TextView privacy = text(
                "الخصوصية: التطبيق يرسل رقم العامل ووقت العملية واتجاه الجهاز فقط. "
                        + "لا يقرأ ولا يرفع قالب البصمة أو صورة الوجه. كلمات مرور الأجهزة "
                        + "والمفتاح السري مشفرة داخل هذا الجهاز بواسطة Android Keystore.\n\n"
                        + "للاستمرار بعد إعادة تشغيل الجهاز: اترك جهاز أندرويد متصلًا بالشاحن "
                        + "وبشبكة Wi‑Fi الخاصة بالورشة، ثم استثنِ التطبيق من تحسين البطارية.",
                13,
                false,
                "#78716C"
        );
        privacy.setGravity(Gravity.CENTER);
        privacy.setLineSpacing(0, 1.25f);
        content.addView(privacy, marginParams(0, 0));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content);
        return scroll;
    }

    private LinearLayout deviceCard(boolean entry) {
        LinearLayout card = card(entry ? "#F4F8F4" : "#FAF3F3", entry ? "#CBDDCB" : "#E5CACA");
        String label = entry ? "جهاز الدخول" : "جهاز الخروج";
        TextView title = sectionTitle(label + (entry ? "  ENTRY" : "  EXIT"));
        title.setTextColor(Color.parseColor(entry ? "#166534" : "#991B1B"));
        card.addView(title, marginParams(0, dp(12)));

        EditText address = field(
                "عنوان الجهاز داخل الشبكة",
                entry ? preferences.getEntryAddress() : preferences.getExitAddress(),
                false,
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI
        );
        card.addView(address, marginParams(0, dp(10)));
        EditText username = field(
                "اسم المستخدم",
                entry ? preferences.getEntryUsername() : preferences.getExitUsername(),
                false,
                InputType.TYPE_CLASS_TEXT
        );
        card.addView(username, marginParams(0, dp(10)));
        EditText password = field(
                "كلمة المرور — اتركها فارغة إذا كانت محفوظة",
                "",
                true,
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );
        card.addView(password, marginParams(0, 0));

        if (entry) {
            entryAddressInput = address;
            entryUsernameInput = username;
            entryPasswordInput = password;
        } else {
            exitAddressInput = address;
            exitUsernameInput = username;
            exitPasswordInput = password;
        }
        return card;
    }

    private void saveAndStart() {
        final String siteUrl = value(siteUrlInput);
        final String enteredSecret = value(ingestSecretInput);
        final String entryAddress = value(entryAddressInput);
        final String entryUsername = value(entryUsernameInput);
        final String entryPassword = value(entryPasswordInput);
        final String exitAddress = value(exitAddressInput);
        final String exitUsername = value(exitUsernameInput);
        final String exitPassword = value(exitPasswordInput);

        try {
            final String normalizedSiteUrl = AttendancePreferences.normalizeSiteUrl(siteUrl);
            final String secretToVerify = enteredSecret.isEmpty()
                    ? preferences.getIngestSecret()
                    : enteredSecret;
            if (secretToVerify.length() < 32 || secretToVerify.length() > 512) {
                throw new IllegalArgumentException("Invalid ingest secret");
            }

            saveButton.setEnabled(false);
            statusTitle.setText("جارٍ التحقق من المفتاح");
            statusTitle.setTextColor(Color.parseColor("#0F766E"));
            statusDetail.setText("يتحقق التطبيق الآن من المفتاح مع الموقع قبل حفظه وتشغيل الإرسال.");

            configurationExecutor.execute(() -> {
                try {
                    new AttendanceApiClient().verifySecret(normalizedSiteUrl, secretToVerify);
                    runOnUiThread(() -> finishVerifiedConfigurationSave(
                            normalizedSiteUrl,
                            secretToVerify,
                            entryAddress,
                            entryUsername,
                            entryPassword,
                            exitAddress,
                            exitUsername,
                            exitPassword
                    ));
                } catch (Exception error) {
                    runOnUiThread(() -> showSecretVerificationError(error));
                }
            });
        } catch (IllegalArgumentException error) {
            saveButton.setEnabled(true);
            statusTitle.setText("راجع الإعدادات");
            statusTitle.setTextColor(Color.parseColor("#B91C1C"));
            statusDetail.setText(
                    "تأكد من رابط الموقع HTTPS، وعناوين الأجهزة المحلية، وأسماء المستخدمين "
                            + "وكلمات المرور. المفتاح السري يجب أن يكون 32 حرفًا على الأقل."
            );
        }
    }

    private void finishVerifiedConfigurationSave(
            String siteUrl,
            String verifiedSecret,
            String entryAddress,
            String entryUsername,
            String entryPassword,
            String exitAddress,
            String exitUsername,
            String exitPassword
    ) {
        if (isFinishing() || isDestroyed()) return;
        try {
            preferences.saveConfiguration(
                    siteUrl,
                    verifiedSecret,
                    entryAddress,
                    entryUsername,
                    entryPassword,
                    exitAddress,
                    exitUsername,
                    exitPassword
            );
            if (!verifiedSecret.equals(preferences.getIngestSecret())) {
                throw new IllegalStateException("Stored attendance secret verification failed");
            }
            preferences.setEnabled(true);
            clearSecretInputs();
            SyncScheduler.schedule(this);
            SyncScheduler.enqueueImmediate(this);
            startServiceAction(AttendanceSyncService.ACTION_CONFIG_CHANGED);
            statusTitle.setText("تم قبول المفتاح وتشغيل المزامنة");
            statusTitle.setTextColor(Color.parseColor("#047857"));
            statusDetail.setText("أكد الموقع المفتاح، وحُفظ مشفرًا داخل الجهاز. جارٍ إرسال السجلات المعلقة.");
            Toast.makeText(this, "تم قبول المفتاح", Toast.LENGTH_SHORT).show();
            statusTitle.postDelayed(this::refreshStatus, 1500);
        } catch (IllegalArgumentException error) {
            statusTitle.setText("راجع إعدادات الأجهزة");
            statusTitle.setTextColor(Color.parseColor("#B91C1C"));
            statusDetail.setText("تم قبول المفتاح، لكن عنوان جهاز أو اسم مستخدم أو كلمة مرور غير مكتمل.");
        } catch (Exception error) {
            statusTitle.setText("تعذر حفظ المفتاح بأمان");
            statusTitle.setTextColor(Color.parseColor("#B91C1C"));
            statusDetail.setText("قبِل الموقع المفتاح، لكن أندرويد لم يؤكد حفظه المشفر. أعد المحاولة دون حذف التطبيق.");
        } finally {
            saveButton.setEnabled(true);
        }
    }

    private void showSecretVerificationError(Exception error) {
        if (isFinishing() || isDestroyed()) return;
        saveButton.setEnabled(true);
        statusTitle.setText("رفض الموقع المفتاح");
        statusTitle.setTextColor(Color.parseColor("#B91C1C"));
        String message = error.getMessage();
        statusDetail.setText(message == null || message.trim().isEmpty()
                ? "تعذر اختبار المفتاح. تحقق من الإنترنت وحاول مجددًا."
                : message);
    }

    private void syncNow() {
        if (!preferences.hasCompleteConfiguration()) {
            Toast.makeText(this, "أكمل الإعدادات واحفظها أولًا", Toast.LENGTH_SHORT).show();
            return;
        }
        preferences.setEnabled(true);
        startServiceAction(AttendanceSyncService.ACTION_SYNC_NOW);
        SyncScheduler.enqueueImmediate(this);
        statusDetail.setText("بدأ فحص جهازي الدخول والخروج الآن…");
    }

    private void stopSync() {
        preferences.setEnabled(false);
        SyncScheduler.cancel(this);
        if (AttendanceSyncService.isRunning()) {
            Intent intent = new Intent(this, AttendanceSyncService.class);
            intent.setAction(AttendanceSyncService.ACTION_STOP);
            startService(intent);
        }
        Toast.makeText(this, "تم إيقاف المزامنة مؤقتًا", Toast.LENGTH_SHORT).show();
        statusTitle.postDelayed(this::refreshStatus, 350);
    }

    private void refreshStatus() {
        AttendanceDatabase.StatusSnapshot snapshot = database.getStatusSnapshot();
        boolean enabled = preferences.isEnabled();
        boolean configured = preferences.hasCompleteConfiguration();
        boolean serviceRunning = AttendanceSyncService.isRunning();

        if (!configured) {
            statusTitle.setText("الإعداد مطلوب مرة واحدة");
            statusTitle.setTextColor(Color.parseColor("#B45309"));
            statusDetail.setText("أدخل المفتاح السري وكلمة مرور كل جهاز ثم اضغط حفظ وتشغيل");
        } else if (!enabled) {
            statusTitle.setText("المزامنة متوقفة مؤقتًا");
            statusTitle.setTextColor(Color.parseColor("#78716C"));
            statusDetail.setText("السجلات المحفوظة محليًا لن تُحذف ويمكن تشغيلها من جديد");
        } else if (serviceRunning) {
            statusTitle.setText("المزامنة التلقائية تعمل");
            statusTitle.setTextColor(Color.parseColor("#047857"));
            statusDetail.setText(AttendanceSyncService.getLastMessage());
        } else {
            statusTitle.setText("المزامنة مجدولة");
            statusTitle.setTextColor(Color.parseColor("#B45309"));
            statusDetail.setText("ستعمل مهمة الأمان تلقائيًا؛ افتح التطبيق لتشغيل الخدمة الدائمة");
        }

        queueText.setText("محفوظ بانتظار الإرسال: " + snapshot.pendingCount + " سجل");
        devicesText.setText(
                "الدخول — آخر قراءة: " + formatTime(snapshot.entry.lastReadAtMs)
                        + " · آخر رفع: " + formatTime(snapshot.entry.lastUploadAtMs)
                        + "\nالخروج — آخر قراءة: " + formatTime(snapshot.exit.lastReadAtMs)
                        + " · آخر رفع: " + formatTime(snapshot.exit.lastUploadAtMs)
                        + (snapshot.latestError.isEmpty()
                        ? ""
                        : "\nآخر تنبيه: " + snapshot.latestError)
        );
    }

    private void startServiceAction(String action) {
        Intent intent = new Intent(this, AttendanceSyncService.class);
        intent.setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
    }

    private void openBatterySettings() {
        try {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (RuntimeException error) {
            startActivity(new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())
            ));
        }
    }

    private void registerStatusReceiver() {
        ContextCompat.registerReceiver(
                this,
                statusReceiver,
                new IntentFilter(AttendanceSyncService.ACTION_STATUS),
                ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
            );
        }
    }

    private void clearSecretInputs() {
        ingestSecretInput.setText("");
        entryPasswordInput.setText("");
        exitPasswordInput.setText("");
    }

    private EditText field(String hint, String value, boolean secret, int inputType) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setTextSize(15);
        input.setSingleLine(true);
        input.setInputType(inputType);
        input.setPadding(dp(13), dp(11), dp(13), dp(11));
        input.setTextDirection(View.TEXT_DIRECTION_LTR);
        input.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        input.setBackground(rounded("#FFFFFF", "#D6D3D1", 10));
        if (secret && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
        return input;
    }

    private Button button(String label, String background, String foreground) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(16);
        button.setTextColor(Color.parseColor(foreground));
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setBackgroundTintList(ColorStateList.valueOf(Color.parseColor(background)));
        button.setMinHeight(dp(52));
        return button;
    }

    private LinearLayout card(String background, String border) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(15), dp(15), dp(15), dp(15));
        card.setBackground(rounded(background, border, 16));
        return card;
    }

    private GradientDrawable rounded(String background, String border, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.parseColor(background));
        drawable.setCornerRadius(dp(radiusDp));
        drawable.setStroke(dp(1), Color.parseColor(border));
        return drawable;
    }

    private TextView sectionTitle(String value) {
        TextView title = text(value, 17, true, "#292524");
        title.setGravity(Gravity.START);
        return title;
    }

    private TextView text(String value, float size, boolean bold, String color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(Color.parseColor(color));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private LinearLayout.LayoutParams marginParams(int top, int bottom) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = top;
        params.bottomMargin = bottom;
        return params;
    }

    private static String value(EditText input) {
        return input.getText().toString().trim();
    }

    private String formatTime(long timeMs) {
        if (timeMs <= 0) return "لم تتم بعد";
        return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(new Date(timeMs));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
