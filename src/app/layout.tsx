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
  title: "ياسمين الشام - خياطة وتفصيل فساتين نسائية في الخبر",
  description: "ياسمين الشام - أفضل محل خياطة وتفصيل فساتين نسائية في الخبر والمنطقة الشرقية. تفصيل فساتين زفاف، سهرة، وخطوبة بأناقة دمشقية. تواصلي معنا الآن.",
  keywords: "خياط ياسمين الشام، ياسمين الشام للخياطة، أفضل خياط في الخبر، تفصيل فساتين الخبر، خياطة نسائية الخبر، فساتين زفاف الخبر، تفصيل فساتين السعودية، خياطة المنطقة الشرقية، فساتين سهرة تفصيل، خياطة فساتين دمشقية",
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
    url: "https://www.yasmin-alsham.fashion",
    siteName: "ياسمين الشام",
    images: [
      {
        url: "https://www.yasmin-alsham.fashion/yasmin.jpg",
        width: 1200,
        height: 630,
        alt: "ياسمين الشام - تفصيل فساتين حسب الطلب",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ياسمين الشام - تفصيل فساتين حسب الطلب",
    description: "محل ياسمين الشام لتفصيل الفساتين النسائية بأناقة دمشقية",
    images: ["https://www.yasmin-alsham.fashion/yasmin.jpg"],
  },
  metadataBase: new URL("https://www.yasmin-alsham.fashion"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        {/* JSON-LD - LocalBusiness Schema for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ClothingStore",
              "name": "ياسمين الشام",
              "alternateName": ["ياسمين الشام للخياطة", "خياط ياسمين الشام", "ياسمين الشام للتفصيل"],
              "url": "https://www.yasmin-alsham.fashion",
              "logo": "https://www.yasmin-alsham.fashion/favicon/favicon-96x96.png",
              "image": "https://www.yasmin-alsham.fashion/yasmin.jpg",
              "description": "أفضل محل خياطة وتفصيل فساتين نسائية في الخبر والمنطقة الشرقية. تفصيل فساتين زفاف وسهرة وخطوبة بأناقة دمشقية.",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "الخبر",
                "addressRegion": "المنطقة الشرقية",
                "addressCountry": "SA"
              },
              "geo": {
                "@type": "GeoCoordinates",
                "addressCountry": "SA",
                "addressLocality": "الخبر"
              },
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+966598862609",
                "contactType": "customer service",
                "availableLanguage": "Arabic"
              },
              "priceRange": "$$",
              "servesCuisine": null,
              "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "خدمات التفصيل والخياطة",
                "itemListElement": [
                  { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "تفصيل فساتين الزفاف" } },
                  { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "تفصيل فساتين السهرة" } },
                  { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "تفصيل فساتين الخطوبة" } },
                  { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "خياطة فساتين يومية" } }
                ]
              },
              "sameAs": [
                "https://wa.me/966598862609"
              ]
            })
          }}
        />
        {/* Google tag (gtag.js) */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-8KCD0TSPCJ"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());

              gtag('config', 'G-8KCD0TSPCJ');
            `,
          }}
        />
      </head>
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
