package com.yasminalsham.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // تفعيل JavaScript للتنقل
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setDomStorageEnabled(true);
        }
    }

    @Override
    public void onBackPressed() {
        // التحقق من إمكانية الرجوع في WebView
        WebView webView = getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            // إذا لم يكن هناك صفحات للرجوع، لا تفعل شيء
            // هذا يمنع الخروج من التطبيق
            // super.onBackPressed();
        }
    }
}
