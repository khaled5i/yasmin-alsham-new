package com.yasminalsham.printbridge;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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

@SuppressLint("SetTextI18n") // Internal Arabic-only setup utility; strings are intentionally not localized.
public final class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1001;

    private EditText printerIpInput;
    private TextView statusText;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver resultReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            boolean success = intent.getBooleanExtra(PrintBridgeService.EXTRA_SUCCESS, false);
            String message = intent.getStringExtra(PrintBridgeService.EXTRA_MESSAGE);
            statusText.setText(success ? "الخدمة جاهزة والطابعة متصلة" : "تعذّر اختبار الطابعة");
            statusText.setTextColor(Color.parseColor(success ? "#047857" : "#BE123C"));
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        setContentView(buildContentView());
        registerResultReceiver();
        requestNotificationPermissionIfNeeded();
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(resultReceiver);
        super.onDestroy();
    }

    private View buildContentView() {
        int padding = dp(24);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setBackgroundColor(Color.parseColor("#FAFAF9"));

        TextView title = new TextView(this);
        title.setText("جسر طباعة ياسمين الشام");
        title.setTextSize(25);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(Color.parseColor("#1C1917"));
        title.setGravity(Gravity.CENTER);
        content.addView(title, matchWrap(0, dp(12)));

        TextView description = new TextView(this);
        description.setText("يعمل هذا الجسر في الخلفية ويرسل إيصالات نسخة Chrome مباشرة إلى الطابعة عبر الشبكة، دون كمبيوتر أو محطة طباعة.");
        description.setTextSize(16);
        description.setTextColor(Color.parseColor("#57534E"));
        description.setGravity(Gravity.CENTER);
        description.setLineSpacing(0, 1.25f);
        content.addView(description, matchWrap(0, dp(28)));

        TextView ipLabel = new TextView(this);
        ipLabel.setText("عنوان الطابعة الثابت");
        ipLabel.setTextSize(14);
        ipLabel.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        ipLabel.setTextColor(Color.parseColor("#292524"));
        content.addView(ipLabel, matchWrap(0, dp(8)));

        printerIpInput = new EditText(this);
        printerIpInput.setText(getPreferences().getString(PrintBridgeService.PREF_PRINTER_IP, PrintBridgeService.DEFAULT_PRINTER_IP));
        printerIpInput.setTextDirection(View.TEXT_DIRECTION_LTR);
        printerIpInput.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        printerIpInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        printerIpInput.setKeyListener(DigitsKeyListener.getInstance("0123456789."));
        printerIpInput.setTextSize(18);
        printerIpInput.setSingleLine(true);
        printerIpInput.setPadding(dp(14), dp(10), dp(14), dp(10));
        content.addView(printerIpInput, matchWrap(0, dp(18)));

        Button startButton = new Button(this);
        startButton.setText("تشغيل الخدمة واختبار الطابعة");
        startButton.setTextSize(16);
        startButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        startButton.setOnClickListener(view -> startAndTestBridge());
        content.addView(startButton, matchWrap(0, dp(10)));

        Button stopButton = new Button(this);
        stopButton.setText("إيقاف خدمة الطباعة");
        stopButton.setOnClickListener(view -> stopBridge());
        content.addView(stopButton, matchWrap(0, dp(22)));

        statusText = new TextView(this);
        statusText.setTextSize(15);
        statusText.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        statusText.setGravity(Gravity.CENTER);
        content.addView(statusText, matchWrap(0, dp(16)));

        TextView details = new TextView(this);
        details.setText("بعد ظهور ورقة الاختبار، ارجع إلى تطبيق ياسمين الشام المثبت من Chrome واضغط «ربط واختبار».\n\nالخدمة المحلية: 127.0.0.1:19281\nمنفذ الطابعة: 9100");
        details.setTextSize(13);
        details.setTextColor(Color.parseColor("#78716C"));
        details.setGravity(Gravity.CENTER);
        details.setLineSpacing(0, 1.25f);
        content.addView(details, matchWrap(0, 0));

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private void startAndTestBridge() {
        String printerIp = printerIpInput.getText().toString().trim();
        if (!PrintBridgeService.isPrivateIpv4(printerIp)) {
            printerIpInput.setError("أدخل عنواناً محلياً صحيحاً، مثل 192.168.100.105");
            return;
        }

        getPreferences().edit().putString(PrintBridgeService.PREF_PRINTER_IP, printerIp).apply();
        startServiceAction(PrintBridgeService.ACTION_START);
        statusText.setText("جارٍ تشغيل الخدمة واختبار الطابعة...");
        statusText.setTextColor(Color.parseColor("#B45309"));
        handler.postDelayed(() -> startServiceAction(PrintBridgeService.ACTION_TEST), 450);
    }

    private void stopBridge() {
        Intent intent = new Intent(this, PrintBridgeService.class);
        intent.setAction(PrintBridgeService.ACTION_STOP);
        startService(intent);
        handler.postDelayed(this::refreshStatus, 250);
    }

    private void startServiceAction(String action) {
        Intent intent = new Intent(this, PrintBridgeService.class);
        intent.setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void refreshStatus() {
        boolean running = PrintBridgeService.isRunning();
        statusText.setText(running ? "خدمة الطباعة تعمل" : "خدمة الطباعة متوقفة");
        statusText.setTextColor(Color.parseColor(running ? "#047857" : "#78716C"));
    }

    private void registerResultReceiver() {
        IntentFilter filter = new IntentFilter(PrintBridgeService.ACTION_RESULT);
        ContextCompat.registerReceiver(
                this,
                resultReceiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private SharedPreferences getPreferences() {
        return getSharedPreferences(PrintBridgeService.PREFS_NAME, MODE_PRIVATE);
    }

    private LinearLayout.LayoutParams matchWrap(int topMargin, int bottomMargin) {
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
