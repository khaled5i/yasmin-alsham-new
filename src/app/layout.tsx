import type { Metadata } from "next";
import { Cairo, Noto_Kufi_Arabic } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import Providers from "@/components/Providers";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: 'swap',
});

const notoKufi = Noto_Kufi_Arabic({
  variable: "--font-noto-kufi",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "ياسمين الشام - تفصيل فساتين حسب الطلب",
  description: "محل ياسمين الشام لتفصيل الفساتين النسائية بأناقة دمشقية. حجز مواعيد، استعلام عن الطلبات، وأفضل الأقمشة.",
  keywords: "تفصيل فساتين، خياطة نسائية، ياسمين الشام، فساتين دمشقية، حجز موعد",
  authors: [{ name: "ياسمين الشام" }],
  icons: {
    icon: [
      { url: '/favicon/favicon.ico', sizes: 'any' },
      { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [
      { url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/favicon/site.webmanifest',
  openGraph: {
    title: "ياسمين الشام - تفصيل فساتين حسب الطلب",
    description: "محل ياسمين الشام لتفصيل الفساتين النسائية بأناقة دمشقية",
    type: "website",
    locale: "ar_SA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        className={`${cairo.variable} ${notoKufi.variable} font-sans antialiased bg-gradient-to-br from-rose-50 to-pink-50 min-h-screen`}
      >
        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            duration: 3000,
            style: {
              background: '#fff',
              color: '#363636',
              padding: '16px',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              fontFamily: 'var(--font-cairo)',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
