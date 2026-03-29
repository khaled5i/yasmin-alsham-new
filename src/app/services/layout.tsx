import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'خدمات الخياطة والتفصيل - ياسمين الشام الخبر',
  description: 'خدمات خياطة وتفصيل الفساتين النسائية في ياسمين الشام. تفصيل فساتين زفاف، سهرة، خطوبة، وعبايات في الخبر والمنطقة الشرقية بأناقة دمشقية.',
  keywords: 'خياطة الخبر، تفصيل فساتين الخبر، خياطة نسائية المنطقة الشرقية، أفضل خياط الخبر، تفصيل فساتين الزفاف',
  openGraph: {
    title: 'خدمات الخياطة والتفصيل - ياسمين الشام الخبر',
    description: 'أفضل خدمات الخياطة والتفصيل في الخبر - فساتين زفاف وسهرة وخطوبة',
    images: [{ url: 'https://www.yasmin-alsham.fashion/yasmin.jpg' }],
  },
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
