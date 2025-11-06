import type { Metadata } from "next";
import { Cairo, Noto_Kufi_Arabic } from "next/font/google";
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
        {children}
      </body>
    </html>
  );
}
