import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { productService } from '@/lib/services/store-service'
import DesignDetailClient from './DesignDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { data: product } = await productService.getById(id)

  if (!product) {
    return {
      title: 'التصميم غير موجود - ياسمين الشام',
      robots: { index: false, follow: false },
    }
  }

  return {
    title: `${product.title} - ياسمين الشام`,
    description: product.description || 'فستان من ياسمين الشام للتفصيل حسب الطلب',
    openGraph: {
      title: `${product.title} - ياسمين الشام`,
      description: product.description || '',
      images: product.images?.[0] ? [{ url: product.images[0] }] : [],
    },
  }
}

export default async function DesignDetailPage({ params }: Props) {
  const { id } = await params
  const { data: product } = await productService.getById(id)

  if (!product) {
    notFound()
  }

  return <DesignDetailClient />
}
