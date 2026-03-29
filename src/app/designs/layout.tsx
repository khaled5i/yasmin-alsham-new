import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'فساتين جاهزة وتصاميم - ياسمين الشام الخبر',
  description: 'تصفحي أجمل تصاميم الفساتين النسائية في ياسمين الشام. فساتين زفاف، سهرة، خطوبة، ومناسبات في الخبر والمنطقة الشرقية.',
  keywords: 'فساتين جاهزة الخبر، تصاميم فساتين، فساتين سهرة الخبر، فساتين زفاف الخبر، ياسمين الشام تصاميم',
  openGraph: {
    title: 'فساتين جاهزة وتصاميم - ياسمين الشام',
    description: 'أجمل تصاميم الفساتين النسائية في الخبر - فساتين زفاف، سهرة، وخطوبة',
    images: [{ url: 'https://www.yasmin-alsham.fashion/yasmin.jpg' }],
  },
}

export default function DesignsLayout({ children }: { children: React.ReactNode }) {
  return children
}
