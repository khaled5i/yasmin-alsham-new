import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'متجر الأقمشة النسائية - ياسمين الشام الخبر',
  description: 'اختاري أجود الأقمشة النسائية في ياسمين الشام. أقمشة للتفصيل والخياطة بأسعار مناسبة في الخبر والمنطقة الشرقية.',
  keywords: 'أقمشة نسائية الخبر، أقمشة تفصيل، أقمشة خياطة، متجر أقمشة الخبر، ياسمين الشام أقمشة',
  openGraph: {
    title: 'متجر الأقمشة النسائية - ياسمين الشام',
    description: 'أجود الأقمشة النسائية للتفصيل والخياطة في الخبر',
    images: [{ url: 'https://www.yasmin-alsham.fashion/yasmin.jpg' }],
  },
}

export default function FabricsLayout({ children }: { children: React.ReactNode }) {
  return children
}
