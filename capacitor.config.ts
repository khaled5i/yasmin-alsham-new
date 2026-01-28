import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yasminalsham.app',
  appName: 'ياسمين الشام',
  webDir: 'out',
  bundledWebRuntime: false,

  // إعدادات الخادم
  server: {
    // في وضع التطوير، استخدم الخادم المحلي
    // url: 'http://localhost:3000',
    // cleartext: true,

    // في الإنتاج، استخدم الملفات المحلية
    // استخدام http بدلاً من https لتجنب مشاكل التنقل مع Chrome 117+
    androidScheme: 'http',
    iosScheme: 'capacitor',
  },

  // إعدادات Android
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    backgroundColor: '#1a1a1a',
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK',
    },
  },

  // إعدادات iOS
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1a1a1a',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },

  // إعدادات الإضافات
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#fefefe',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;

