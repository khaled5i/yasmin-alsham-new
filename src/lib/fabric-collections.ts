/**
 * مجموعات المتجر: صفحة ثابتة لكل نوع قماش برابط تصلح لجوجل والإعلانات
 * (/fabrics/collections/lace/ …). الفرز من أعمدة tags وoccasions التي كُتبت من
 * تحليل صور الأقمشة (scripts/data/fabric-descriptions-2026-10-20.sql) ولا تلمسها
 * مزامنة المخزون. وحدة نقية تعمل على الخادم والمتصفح.
 */

export interface FabricCollection {
  slug: string
  /** العنوان الرئيسي للصفحة وشريحة الرابط. */
  title: string
  /** فقرة الصفحة ووصف جوجل. */
  intro: string
  /** يكفي وسم واحد منها (overlaps). */
  anyTags?: string[]
  /** يلزم كل الوسوم (contains). */
  allTags?: string[]
  /** يلزم كل المناسبات (contains). */
  occasions?: string[]
}

export const FABRIC_COLLECTIONS: FabricCollection[] = [
  {
    slug: 'bridal',
    title: 'أقمشة فساتين الزفاف',
    intro: 'أقمشة بألوان العروس الهادئة (الأبيض والسكري والبيج) بتطريز كثيف وورود بارزة وخرز لؤلؤي، مختارة لفستان الزفاف والملكة.',
    occasions: ['زفاف'],
  },
  {
    slug: 'lace',
    title: 'أقمشة دانتيل',
    intro: 'دانتيل شانتيلي ناعم، ودانتيل كوردونيه بزخارف محددة، ودانتيل جبيير متماسك، لفساتين السهرة والأكمام والطبقات الخارجية.',
    anyTags: ['دانتيل', 'دانتيل جبيير'],
  },
  {
    slug: 'embroidered-tulle',
    title: 'تول مطرز',
    intro: 'تول شفاف مطرز بنقشات الأغصان والسنابل والورود، من التطريز الناعم بلون واحد إلى التطريز الكثيف بلمعة الترتر.',
    allTags: ['تول', 'تطريز'],
  },
  {
    slug: 'sequins',
    title: 'أقمشة ترتر',
    intro: 'أقمشة مغطاة بالترتر بأحجام ولمعات مختلفة: ترتر منثور ناعم، وترتر كثيف يغطي القماش، وخطوط ترتر متموجة.',
    anyTags: ['ترتر'],
  },
  {
    slug: 'beaded',
    title: 'أقمشة مشغولة بالخرز',
    intro: 'تول ودانتيل مشغول بالخرز: شبكات هندسية، وريش متموج، وخطوط طولية تطيل القوام، وخرز لؤلؤي لفساتين المناسبات الكبيرة.',
    anyTags: ['خرز'],
  },
  {
    slug: 'crystal',
    title: 'أقمشة بالكريستال',
    intro: 'أقمشة بحبات الكريستال المنثورة أو المرصوصة بنقشات شعاعية وشبكية، تعطي الفستان لمعة واضحة تحت إضاءة السهرة.',
    anyTags: ['كريستال'],
  },
  {
    slug: '3d-flowers',
    title: 'أقمشة بورود بارزة',
    intro: 'تول بورود ثلاثية الأبعاد بارزة عن سطح القماش، وحدها أو مع الخرز والترتر، لفستان يلفت النظر من غير إضافات.',
    anyTags: ['ورود بارزة ثلاثية الأبعاد'],
  },
  {
    slug: 'applique',
    title: 'أقمشة أبليك',
    intro: 'ورود وأوراق أبليك مضافة على التول والدانتيل، بلون واحد أو بلونين متباينين، لتصاميم جريئة وواضحة التفاصيل.',
    anyTags: ['قطع أبليك'],
  },
  {
    slug: 'devore-velvet',
    title: 'مخمل محروق',
    intro: 'مخمل محروق (ديفوريه): نقشة مخملية على أرضية شفافة بورود ونقوش رخامية، لفساتين السهرة والجلابيات في المواسم الباردة.',
    anyTags: ['مخمل محروق'],
  },
  {
    slug: 'jacquard',
    title: 'أقمشة جاكار',
    intro: 'جاكار منسوج بلمعة معدنية ونقشات تجريدية ورخامية، خامة متماسكة تحافظ على شكل القصّة في الفساتين والجاكيتات.',
    anyTags: ['جاكار'],
  },
]

export const getFabricCollection = (slug: string) => FABRIC_COLLECTIONS.find(c => c.slug === slug)

export const fabricCollectionPath = (slug: string) => `/fabrics/collections/${slug}/`

/** نفس شرط الصفحة، للعدّ في المتصفح (روابط المجموعات في الرئيسية). */
export function fabricMatchesCollection(
  fabric: { tags?: string[] | null; occasions?: string[] | null },
  collection: FabricCollection
): boolean {
  const tags = fabric.tags ?? []
  const occasions = fabric.occasions ?? []
  if (collection.anyTags && !collection.anyTags.some(t => tags.includes(t))) return false
  if (collection.allTags && !collection.allTags.every(t => tags.includes(t))) return false
  if (collection.occasions && !collection.occasions.every(o => occasions.includes(o))) return false
  return true
}
