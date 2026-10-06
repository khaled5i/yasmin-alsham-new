// next.config.ts
import type { NextConfig } from 'next';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

// الدفعة D (AUD-10): ترويسات أمنية لكل الصفحات. سياسة المحتوى (CSP) بوضع «تقرير فقط» أولاً: تُظهر
// المخالفات في أدوات المتصفح ولا تمنع شيئاً، حتى تثبت القائمة ثم تُفرض. بقية الترويسات مفروضة:
// HTTPS دائماً، لا تأطير للموقع (لا صفحة تؤطّر صفحة أخرى في المشروع)، لا تخمين لنوع الملف، ومرجع مختصر.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com wss://stt-rt.soniox.com https://api.aladhan.com",
  "media-src 'self' blob: https://*.supabase.co",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.moyasar.com",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  // بلا includeSubDomains: لا نعرف أن كل نطاق فرعي للنطاق يعمل بـHTTPS
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
]

const nextConfig: NextConfig = {
  // التصدير الثابت (Capacitor) لا يدعم الترويسات
  ...(!isCapacitorBuild && {
    async headers() {
      return [{ source: '/:path*', headers: securityHeaders }]
    },
  }),
  // تفعيل التصدير الثابت لـ Capacitor
  output: isCapacitorBuild ? 'export' : undefined,

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // مطلوب للتصدير الثابت
  trailingSlash: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // السماح بـ Dynamic Routes في Static Export
  ...(isCapacitorBuild && {
    // في وضع Capacitor، نستخدم fallback للصفحات الديناميكية
    skipTrailingSlashRedirect: true,
  }),
  images: {
    // في وضع Capacitor، نستخدم unoptimized لأن التصدير الثابت لا يدعم التحسين
    unoptimized: isCapacitorBuild,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default nextConfig;
