package com.yasminalsham.alterationbridge;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.text.method.DigitsKeyListener;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import com.yasminalsham.alterationbridge.config.StationPreferences;
import com.yasminalsham.alterationbridge.model.StationStatus;

@SuppressLint("SetTextI18n")
public final class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1001;

    private StationPreferences preferences;
    private EditText pairingCodeInput;
    private EditText printerIpInput;
    private TextView roleText;
    private TextView detailText;
    private TextView countersText;
    private TextView pairingStateText;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshStatus();
            String message = intent.getStringExtra(AlterationBridgeService.EXTRA_MESSAGE);
            if (message != null && !message.trim().isEmpty()) {
                detailText.setText(message);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = new StationPreferences(this);
        getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        setContentView(buildContentView());
        registerStatusReceiver();
        requestNotificationPermissionIfNeeded();
        if (preferences.isEnabled()) startServiceAction(AlterationBridgeService.ACTION_START);
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
        super.onDestroy();
    }

    private View buildContentView() {
        int padding = dp(22);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        content.setBackgroundColor(Color.parseColor("#FAFAF9"));

        TextView title = text("محطة طباعة التعديلات", 26, true, "#1C1917");
        title.setGravity(Gravity.CENTER);
        content.addView(title, params(0, dp(8)));

        TextView subtitle = text(
                "ورشة التعديلات · رئيسية واحتياطية تلقائيًا",
                15,
                false,
                "#57534E"
        );
        subtitle.setGravity(Gravity.CENTER);
        content.addView(subtitle, params(0, dp(22)));

        LinearLayout statusCard = new LinearLayout(this);
        statusCard.setOrientation(LinearLayout.VERTICAL);
        statusCard.setPadding(dp(16), dp(14), dp(16), dp(14));
        statusCard.setBackgroundColor(Color.WHITE);

        roleText = text("", 20, true, "#1C1917");
        roleText.setGravity(Gravity.CENTER);
        statusCard.addView(roleText, params(0, dp(5)));
        detailText = text("", 14, false, "#57534E");
        detailText.setGravity(Gravity.CENTER);
        statusCard.addView(detailText, params(0, dp(7)));
        countersText = text("", 13, true, "#78716C");
        countersText.setGravity(Gravity.CENTER);
        statusCard.addView(countersText, params(0, 0));
        content.addView(statusCard, params(0, dp(22)));

        pairingStateText = text("", 13, true, "#57534E");
        content.addView(pairingStateText, params(0, dp(7)));

        TextView pairingLabel = text("رمز ربط المحطة", 14, true, "#292524");
        content.addView(pairingLabel, params(0, dp(6)));

        pairingCodeInput = new EditText(this);
        pairingCodeInput.setHint("station_uuid.secret");
        pairingCodeInput.setTextDirection(View.TEXT_DIRECTION_LTR);
        pairingCodeInput.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        pairingCodeInput.setSingleLine(true);
        pairingCodeInput.setInputType(
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );
        pairingCodeInput.setPadding(dp(14), dp(10), dp(14), dp(10));
        content.addView(pairingCodeInput, params(0, dp(16)));

        TextView ipLabel = text("عنوان الطابعة الثابت", 14, true, "#292524");
        content.addView(ipLabel, params(0, dp(6)));

        printerIpInput = new EditText(this);
        printerIpInput.setText(preferences.getPrinterIp());
        printerIpInput.setTextDirection(View.TEXT_DIRECTION_LTR);
        printerIpInput.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        printerIpInput.setInputType(
                InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL
        );
        printerIpInput.setKeyListener(DigitsKeyListener.getInstance("0123456789."));
        printerIpInput.setTextSize(18);
        printerIpInput.setSingleLine(true);
        printerIpInput.setPadding(dp(14), dp(10), dp(14), dp(10));
        content.addView(printerIpInput, params(0, dp(16)));

        Button saveButton = new Button(this);
        saveButton.setText("حفظ وتشغيل المحطة");
        saveButton.setTextSize(16);
        saveButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        saveButton.setOnClickListener(view -> saveAndStart());
        content.addView(saveButton, params(0, dp(9)));

        Button stopButton = new Button(this);
        stopButton.setText("إيقاف المحطة مؤقتًا");
        stopButton.setOnClickListener(view -> stopStation());
        content.addView(stopButton, params(0, dp(9)));

        Button unpairButton = new Button(this);
        unpairButton.setText("إلغاء ربط هذا التابلت");
        unpairButton.setOnClickListener(view -> unpairStation());
        content.addView(unpairButton, params(0, dp(9)));

        Button batteryButton = new Button(this);
        batteryButton.setText("فتح إعدادات البطارية");
        batteryButton.setOnClickListener(view -> openBatterySettings());
        content.addView(batteryButton, params(0, dp(20)));

        TextView notes = text(
                "اترك التابلت موصولًا بالشاحن وعلى شبكة Wi-Fi الخاصة بطابعة الورشة، "
                        + "واستثنِ التطبيق من تحسين البطارية. لا يتصل الموقع بهذه "
                        + "المحطة مباشرة؛ كل ورقة تعديل تمر عبر الطابور الآمن.\n\n"
                        + "كل مهمة تُخرج ورقتين: العربية ثم الهندية، "
                        + "ويفصل بينهما قطع كامل.\n\n"
                        + "الخدمة التشخيصية فقط: 127.0.0.1:19381/health",
                13,
                false,
                "#78716C"
        );
        notes.setGravity(Gravity.CENTER);
        notes.setLineSpacing(0, 1.25f);
        content.addView(notes, params(0, 0));

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private void saveAndStart() {
        String printerIp = printerIpInput.getText().toString().trim();
        if (!StationPreferences.isPrivateIpv4(printerIp)) {
            printerIpInput.setError("أدخل عنوان طابعة الورشة، مثل 192.168.100.105");
            return;
        }

        StationPreferences.PairingCredentials current = preferences.getCredentials();
        String pairingCode = pairingCodeInput.getText().toString().trim();
        if (pairingCode.isEmpty() && current == null) {
            pairingCodeInput.setError("أدخل رمز الربط الصادر من لوحة الإدارة");
            return;
        }

        try {
            if (!pairingCode.isEmpty()) preferences.savePairingCode(pairingCode);
            preferences.savePrinterIp(printerIp);
            preferences.setEnabled(true);
            pairingCodeInput.setText("");
            startServiceAction(AlterationBridgeService.ACTION_CONFIG_CHANGED);
            Toast.makeText(this, "تم حفظ إعدادات محطة الورشة", Toast.LENGTH_SHORT).show();
            refreshStatus();
        } catch (Exception error) {
            pairingCodeInput.setError("رمز الربط غير صالح أو تعذّر حفظه بأمان");
        }
    }

    private void stopStation() {
        Intent intent = new Intent(this, AlterationBridgeService.class);
        intent.setAction(AlterationBridgeService.ACTION_STOP);
        startService(intent);
        preferences.setEnabled(false);
        roleText.postDelayed(this::refreshStatus, 300);
    }

    private void unpairStation() {
        Intent intent = new Intent(this, AlterationBridgeService.class);
        intent.setAction(AlterationBridgeService.ACTION_UNPAIR);
        startService(intent);
        pairingCodeInput.setText("");
        Toast.makeText(this, "تم إلغاء ربط هذا التابلت", Toast.LENGTH_SHORT).show();
        roleText.postDelayed(this::refreshStatus, 350);
    }

    private void openBatterySettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            startActivity(intent);
        } catch (RuntimeException error) {
            Intent fallback = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())
            );
            startActivity(fallback);
        }
    }

    private void refreshStatus() {
        StationStatus status = AlterationBridgeService.getLastStatus();
        boolean serviceRunning = AlterationBridgeService.isRunning();
        StationPreferences.PairingCredentials credentials = preferences.getCredentials();

        if (!serviceRunning) {
            roleText.setText("المحطة متوقفة");
            roleText.setTextColor(Color.parseColor("#78716C"));
            detailText.setText("اضغط «حفظ وتشغيل المحطة» لتشغيلها");
        } else {
            switch (status.role) {
                case ACTIVE:
                    roleText.setText("المحطة الرئيسية ACTIVE");
                    roleText.setTextColor(Color.parseColor("#047857"));
                    detailText.setText(
                            status.printerReachable
                                    ? "الطابعة متصلة وجاهزة لاستقبال أوراق التعديلات"
                                    : "المحطة نشطة لكن الطابعة غير متاحة"
                    );
                    break;
                case STANDBY:
                    roleText.setText("المحطة الاحتياطية STANDBY");
                    roleText.setTextColor(Color.parseColor("#B45309"));
                    detailText.setText("تراقب المحطة الرئيسية وستستلم العمل تلقائيًا عند انقطاعها");
                    break;
                case UNPAIRED:
                    roleText.setText("غير مرتبطة");
                    roleText.setTextColor(Color.parseColor("#BE123C"));
                    detailText.setText("أدخل رمز الربط الصادر من لوحة الإدارة");
                    break;
                case OFFLINE:
                    roleText.setText("الاتصال غير متاح");
                    roleText.setTextColor(Color.parseColor("#BE123C"));
                    detailText.setText(status.lastError);
                    break;
                case STOPPED:
                default:
                    roleText.setText("جارٍ تشغيل المحطة");
                    roleText.setTextColor(Color.parseColor("#57534E"));
                    detailText.setText("يتم الآن الاتصال بخدمة الطباعة");
                    break;
            }
        }

        countersText.setText(
                "أوراق بانتظار الطباعة: " + status.pendingCount
                        + "   ·   غير مؤكدة: " + status.unknownCount
                        + "   ·   الطابعة: " + (status.printerReachable ? "متصلة" : "غير متصلة")
        );
        if (credentials == null) {
            pairingStateText.setText("هذا التابلت غير مربوط بمحطة");
        } else {
            String id = credentials.stationId;
            String shortId = id.length() > 13
                    ? id.substring(0, 8) + "…" + id.substring(id.length() - 4)
                    : id;
            pairingStateText.setText("مربوط بالمحطة: " + shortId);
        }
    }

    private void startServiceAction(String action) {
        Intent intent = new Intent(this, AlterationBridgeService.class);
        intent.setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void registerStatusReceiver() {
        ContextCompat.registerReceiver(
                this,
                statusReceiver,
                new IntentFilter(AlterationBridgeService.ACTION_STATUS),
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

    private TextView text(String value, float size, boolean bold, String color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(Color.parseColor(color));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private LinearLayout.LayoutParams params(int topMargin, int bottomMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = topMargin;
        params.bottomMargin = bottomMargin;
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
