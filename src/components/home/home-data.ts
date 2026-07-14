export type TailoringShowcaseItem = {
  id: string
  title?: string
  description?: string
  imageUrl: string
  alt: string
  aspectRatio: 'portrait' | 'landscape' | 'square'
  isFeatured: boolean
  displayOrder: number
  isActive: boolean
}

export const HOME_WHATSAPP_NUMBER = '966598862609'

const tailoringMessage =
  'مرحبًا، أرغب في الاستفسار عن تفصيل فستان لدى ياسمين الشام.'

export const tailoringWhatsAppUrl = `https://wa.me/${HOME_WHATSAPP_NUMBER}?text=${encodeURIComponent(tailoringMessage)}`

export const homeMedia = {
  hero: {
    mobilePoster: '/media/home/hero-mobile.webp',
    desktopPoster: '/media/home/hero-desktop.webp',
    // تضاف النسخ النهائية هنا بعد إنتاجها من برومبتات الـPRD.
    mobileVideo: undefined as string | undefined,
    desktopVideo: undefined as string | undefined,
  },
  craftPoster: '/media/home/craft-poster.webp',
  transitionPoster: '/media/home/fabric-transition.webp',
  campaignPoster: '/media/home/campaign-fabrics.webp',
}

export const tailoringShowcase: TailoringShowcaseItem[] = [
  {
    id: 'atelier-signature',
    title: 'تناغم القصّة والتطريز',
    description: 'لقطة أولية من هوية المشغل.',
    imageUrl: '/media/home/work-01.webp',
    alt: 'فستان سهرة وردي على مانيكان في مشغل دافئ',
    aspectRatio: 'portrait',
    isFeatured: true,
    displayOrder: 1,
    isActive: true,
  },
  {
    id: 'atelier-full-look',
    title: 'حضور هادئ',
    imageUrl: '/media/home/work-02.webp',
    alt: 'فستان سهرة بقصّة واسعة وتفاصيل ناعمة',
    aspectRatio: 'portrait',
    isFeatured: true,
    displayOrder: 2,
    isActive: true,
  },
  {
    id: 'embroidery-detail',
    title: 'تفاصيل مدروسة',
    imageUrl: '/media/home/work-03.webp',
    alt: 'لقطة قريبة للتطريز وثنيات قماش فستان وردي',
    aspectRatio: 'portrait',
    isFeatured: false,
    displayOrder: 3,
    isActive: true,
  },
  {
    id: 'bodice-detail',
    title: 'دقة التشكيل',
    imageUrl: '/media/home/work-04.webp',
    alt: 'تفاصيل تشكيل صدر فستان سهرة وردي',
    aspectRatio: 'portrait',
    isFeatured: false,
    displayOrder: 4,
    isActive: true,
  },
  {
    id: 'first-sketch',
    title: 'تبدأ بالفكرة',
    imageUrl: '/media/home/work-05.webp',
    alt: 'رسم أزياء أولي يوضح مرحلة بناء فكرة الفستان',
    aspectRatio: 'portrait',
    isFeatured: false,
    displayOrder: 5,
    isActive: true,
  },
  {
    id: 'fabric-finish',
    title: 'اللمسة الأخيرة',
    imageUrl: '/media/home/work-06.webp',
    alt: 'لقطة قريبة لطبقات القماش والتطريز في الفستان',
    aspectRatio: 'portrait',
    isFeatured: false,
    displayOrder: 6,
    isActive: true,
  },
]

