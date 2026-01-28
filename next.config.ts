// next.config.ts
import type { NextConfig } from 'next';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const nextConfig: NextConfig = {
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
