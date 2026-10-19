import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'موقع محل ياسمين الشام للخياطة والأقمشة في الخبر',
  description: 'محل ياسمين الشام للخياطة النسائية والأقمشة في الخبر الشمالية، شارع الأمير مشعل، التقاطع 6. نستقبلكِ من السبت إلى الخميس من 4 مساءً حتى 10 مساءً.',
  alternates: { canonical: '/location/' },
  openGraph: {
    title: 'موقع ياسمين الشام - الخبر',
    description: 'الخبر الشمالية، شارع الأمير مشعل، التقاطع 6 — السبت إلى الخميس 4 م - 10 م.',
    images: [{ url: 'https://www.yasmin-alsham.fashion/yasmin.jpg' }],
  },
}

export default function LocationLayout({ children }: { children: React.ReactNode }) {
  return children
}
