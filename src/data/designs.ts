export interface Design {
  id: number
  title: string
  description: string
  category: string
  images: string[]
  price: number

  fabric?: string
  colors?: string[]
  sizes?: string[]
  features?: string[]
  occasions?: string[]
  care_instructions?: string[]
  rating?: number
  reviews_count?: number
}

export const allDesigns: Design[] = [
  {
    id: 1,
    title: 'فستان زفاف كلاسيكي',
    description: 'فستان زفاف أنيق بتصميم كلاسيكي مع تطريز يدوي رائع يجمع بين الأناقة والفخامة',
    category: 'فساتين زفاف',
    price: 1299,
    images: [
      '/wedding-dress-1.jpg.jpg',
      '/wedding-dress-1a.jpg.jpg',
      '/wedding-dress-1b.jpg.jpg'
    ],
    fabric: 'شيفون حريري',
    colors: ['أبيض', 'كريمي', 'عاجي'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    features: [
      'تطريز يدوي فاخر',
      'قماش شيفون حريري عالي الجودة',
      'تصميم كلاسيكي خالد',
      'قصة مناسبة لجميع أنواع الجسم',
      'تفاصيل دقيقة ومتقنة'
    ],
    occasions: ['حفلات الزفاف', 'المناسبات الرسمية', 'الحفلات الخاصة'],
    care_instructions: [
      'تنظيف جاف فقط',
      'تجنب التعرض المباشر لأشعة الشمس',
      'تخزين في مكان جاف وبارد',
      'كي على درجة حرارة منخفضة'
    ],
    rating: 4.9,
    reviews_count: 127
  },
  {
    id: 2,
    title: 'فستان سهرة راقي',
    description: 'فستان سهرة طويل بقصة عصرية ولمسات ذهبية تضفي لمسة من الفخامة والأناقة',
    category: 'فساتين سهرة',
    price: 899,
    images: [
      '/wedding-dress-2.jpg.jpg',
      '/wedding-dress-2a.jpg.jpg',
      '/wedding-dress-2b.jpg.jpg'
    ],
    fabric: 'ساتان مطرز',
    colors: ['أسود', 'أزرق داكن', 'بورجندي'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    features: [
      'تطريز ذهبي فاخر',
      'قصة طويلة أنيقة',
      'تصميم عصري مميز',
      'خامات عالية الجودة'
    ],
    occasions: ['حفلات السهرة', 'المناسبات الرسمية', 'الحفلات الخاصة'],
    care_instructions: [
      'تنظيف جاف فقط',
      'تجنب التعرض للرطوبة',
      'تخزين معلق في الخزانة'
    ],
    rating: 4.7,
    reviews_count: 89
  },
  {
    id: 3,
    title: 'فستان كوكتيل أنيق',
    description: 'فستان كوكتيل قصير بتصميم عصري ومميز يناسب المناسبات الاجتماعية والحفلات',
    category: 'فساتين كوكتيل',
    price: 599,
    images: [
      '/wedding-dress-3.jpg.jpg',
      '/wedding-dress-3a.jpg.jpg',
      '/wedding-dress-3b.jpg.jpg'
    ],
    fabric: 'شيفون مطرز',
    colors: ['وردي', 'أبيض', 'بيج'],
    sizes: ['XS', 'S', 'M', 'L'],
    features: [
      'قصة قصيرة عصرية',
      'تطريز دقيق',
      'تصميم مريح',
      'مناسب للحفلات'
    ],
    occasions: ['حفلات الكوكتيل', 'المناسبات الاجتماعية', 'الحفلات النهارية'],
    care_instructions: [
      'يمكن غسله بالماء البارد',
      'تجفيف في الهواء',
      'كي على درجة حرارة متوسطة'
    ],
    rating: 4.8,
    reviews_count: 156
  },
  {
    id: 4,
    title: 'فستان مناسبات خاصة',
    description: 'فستان أنيق للمناسبات الخاصة بتصميم راقي وتفاصيل مميزة',
    category: 'فساتين مناسبات',
    price: 749,
    images: [
      '/wedding-dress-4.jpg.jpg',
      '/wedding-dress-4a.jpg.jpg',
      '/wedding-dress-4b.jpg.jpg'
    ],
    fabric: 'حرير طبيعي',
    colors: ['أزرق', 'أخضر', 'بنفسجي'],
    sizes: ['S', 'M', 'L', 'XL'],
    features: [
      'حرير طبيعي فاخر',
      'تصميم راقي',
      'قصة مريحة',
      'تفاصيل مميزة'
    ],
    occasions: ['المناسبات الخاصة', 'الحفلات العائلية', 'المناسبات الرسمية'],
    care_instructions: [
      'تنظيف جاف فقط',
      'تجنب أشعة الشمس المباشرة',
      'تخزين في مكان بارد وجاف'
    ],
    rating: 4.6,
    reviews_count: 73
  },
  {
    id: 5,
    title: 'فستان زفاف ملكي',
    description: 'فستان زفاف فاخر بتصميم ملكي مع تنورة واسعة وتطريز كريستالي',
    category: 'فساتين زفاف',
    price: 1599,
    images: [
      '/wedding-dress-5.jpg.jpg',
      '/wedding-dress-5a.jpg.jpg',
      '/wedding-dress-5b.jpg.jpg'
    ],
    fabric: 'تول وساتان',
    colors: ['أبيض', 'عاجي'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    features: [
      'تصميم ملكي فاخر',
      'تطريز كريستالي',
      'تنورة واسعة',
      'ذيل طويل أنيق'
    ],
    occasions: ['حفلات الزفاف الفاخرة', 'المناسبات الملكية'],
    care_instructions: [
      'تنظيف جاف متخصص فقط',
      'تخزين في كيس خاص',
      'تجنب الطي'
    ],
    rating: 4.9,
    reviews_count: 201
  },
  {
    id: 6,
    title: 'فستان سهرة كلاسيكي',
    description: 'فستان سهرة بتصميم كلاسيكي خالد مع لمسات عصرية أنيقة',
    category: 'فساتين سهرة',
    price: 799,
    images: [
      '/wedding-dress-6.jpg.jpg',
      '/wedding-dress-6a.jpg.jpg',
      '/wedding-dress-6b.jpg.jpg'
    ],
    fabric: 'شيفون وساتان',
    colors: ['أسود', 'أحمر', 'أزرق داكن'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    features: [
      'تصميم كلاسيكي',
      'لمسات عصرية',
      'قصة أنيقة',
      'خامات فاخرة'
    ],
    occasions: ['حفلات السهرة', 'المناسبات الرسمية', 'الحفلات الخاصة'],
    care_instructions: [
      'تنظيف جاف',
      'تجنب الكي المباشر',
      'تخزين معلق'
    ],
    rating: 4.5,
    reviews_count: 94
  },
  {
    id: 7,
    title: 'فستان كوكتيل عصري',
    description: 'فستان كوكتيل بتصميم عصري جريء مع تفاصيل مميزة وقصة عملية',
    category: 'فساتين كوكتيل',
    price: 649,
    images: [
      '/wedding-dress-7.jpg.jpg',
      '/wedding-dress-7a.jpg.jpg',
      '/wedding-dress-7b.jpg.jpg'
    ],
    fabric: 'كريب مطاطي',
    colors: ['أسود', 'أحمر', 'أزرق'],
    sizes: ['XS', 'S', 'M', 'L'],
    features: [
      'تصميم عصري',
      'قصة عملية',
      'خامة مريحة',
      'تفاصيل مميزة'
    ],
    occasions: ['حفلات الكوكتيل', 'المناسبات الاجتماعية', 'الحفلات المسائية'],
    care_instructions: [
      'غسيل بالماء البارد',
      'تجفيف طبيعي',
      'كي على درجة منخفضة'
    ],
    rating: 4.7,
    reviews_count: 112
  },
  {
    id: 8,
    title: 'فستان مناسبات راقي',
    description: 'فستان راقي للمناسبات الخاصة بتصميم أنيق وتفاصيل فاخرة',
    category: 'فساتين مناسبات',
    price: 849,
    images: [
      '/wedding-dress-8.jpg.jpg',
      '/wedding-dress-8a.jpg.jpg',
      '/wedding-dress-8b.jpg.jpg'
    ],
    fabric: 'ساتان مطرز',
    colors: ['ذهبي', 'فضي', 'وردي'],
    sizes: ['S', 'M', 'L', 'XL'],
    features: [
      'تطريز فاخر',
      'تصميم راقي',
      'خامات عالية الجودة',
      'قصة مميزة'
    ],
    occasions: ['المناسبات الراقية', 'الحفلات الخاصة', 'المناسبات الرسمية'],
    care_instructions: [
      'تنظيف جاف فقط',
      'تجنب الرطوبة',
      'تخزين في مكان جاف'
    ],
    rating: 4.6,
    reviews_count: 67
  },
  {
    id: 9,
    title: 'فستان زفاف رومانسي',
    description: 'فستان زفاف رومانسي بتصميم حالم مع تفاصيل من الدانتيل والورود',
    category: 'فساتين زفاف',
    price: 1199,
    images: [
      '/wedding-dress-9.jpg.jpg',
      '/wedding-dress-9a.jpg.jpg',
      '/wedding-dress-9b.jpg.jpg'
    ],
    fabric: 'دانتيل وتول',
    colors: ['أبيض', 'كريمي', 'وردي فاتح'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    features: [
      'دانتيل فرنسي',
      'تصميم رومانسي',
      'تفاصيل ورود',
      'قصة حالمة'
    ],
    occasions: ['حفلات الزفاف', 'المناسبات الرومانسية'],
    care_instructions: [
      'تنظيف جاف متخصص',
      'تجنب الشد',
      'تخزين مسطح'
    ],
    rating: 4.8,
    reviews_count: 143
  },
  {
    id: 10,
    title: 'فستان سهرة فاخر',
    description: 'فستان سهرة فاخر بتصميم مميز مع تطريز كريستالي وقصة أنيقة',
    category: 'فساتين سهرة',
    price: 999,
    images: [
      '/wedding-dress-10.jpg.jpg',
      '/wedding-dress-10a.jpg.jpg',
      '/wedding-dress-10b.jpg.jpg'
    ],
    fabric: 'ساتان وكريستال',
    colors: ['أسود', 'أزرق ملكي', 'بورجندي'],
    sizes: ['XS', 'S', 'M', 'L'],
    features: [
      'تطريز كريستالي',
      'تصميم فاخر',
      'قصة أنيقة',
      'خامات راقية'
    ],
    occasions: ['حفلات السهرة الفاخرة', 'المناسبات الراقية'],
    care_instructions: [
      'تنظيف جاف فقط',
      'تجنب الاحتكاك',
      'تخزين في كيس خاص'
    ],
    rating: 4.7,
    reviews_count: 98
  },
  {
    id: 11,
    title: 'فستان كوكتيل مميز',
    description: 'فستان كوكتيل مميز بتصميم جريء وألوان زاهية مناسب للحفلات',
    category: 'فساتين كوكتيل',
    price: 699,
    images: [
      '/wedding-dress-11.jpg.jpg',
      '/wedding-dress-11a.jpg.jpg',
      '/wedding-dress-11b.jpg.jpg'
    ],
    fabric: 'شيفون ملون',
    colors: ['أحمر', 'أخضر', 'أزرق فاتح'],
    sizes: ['XS', 'S', 'M', 'L'],
    features: [
      'ألوان زاهية',
      'تصميم جريء',
      'قصة عملية',
      'مناسب للحفلات'
    ],
    occasions: ['حفلات الكوكتيل', 'الحفلات الصيفية', 'المناسبات الاجتماعية'],
    care_instructions: [
      'غسيل بالماء البارد',
      'تجفيف في الظل',
      'كي بحذر'
    ],
    rating: 4.6,
    reviews_count: 134
  },
  {
    id: 12,
    title: 'فستان مناسبات كلاسيكي',
    description: 'فستان كلاسيكي للمناسبات بتصميم خالد وأناقة لا تنتهي',
    category: 'فساتين مناسبات',
    price: 799,
    images: [
      '/wedding-dress-12.jpg.jpg',
      '/wedding-dress-12a.jpg.jpg',
      '/wedding-dress-12b.jpg.jpg'
    ],
    fabric: 'حرير وساتان',
    colors: ['أسود', 'أزرق داكن', 'بني'],
    sizes: ['S', 'M', 'L', 'XL'],
    features: [
      'تصميم كلاسيكي',
      'أناقة خالدة',
      'خامات فاخرة',
      'قصة مريحة'
    ],
    occasions: ['المناسبات الرسمية', 'الحفلات الكلاسيكية', 'المناسبات العائلية'],
    care_instructions: [
      'تنظيف جاف',
      'تجنب أشعة الشمس',
      'تخزين معلق'
    ],
    rating: 4.4,
    reviews_count: 76
  }
]

export function addDesign(design: Design) {
  allDesigns.push(design)
}
