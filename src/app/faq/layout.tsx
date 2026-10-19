import { Metadata } from 'next'
import { FAQS } from './faq-data'

export const metadata: Metadata = {
  title: 'الأسئلة الشائعة عن التفصيل والأقمشة - ياسمين الشام الخبر',
  description: 'مدة تفصيل الفستان، أوقات العمل، التعديلات، أنواع الأقمشة، تتبع الطلب والتوصيل لجميع مناطق المملكة — إجابات ياسمين الشام في الخبر.',
  alternates: { canonical: '/faq/' },
  openGraph: {
    title: 'الأسئلة الشائعة - ياسمين الشام',
    description: 'كل ما تحتاجين معرفته عن تفصيل الفساتين والأقمشة في ياسمين الشام بالخبر.',
    images: [{ url: 'https://www.yasmin-alsham.fashion/yasmin.jpg' }],
  },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(faq => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {children}
    </>
  )
}
