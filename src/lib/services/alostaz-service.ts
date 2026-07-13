/**
 * خدمة الربط مع تطبيق الأستاذ للمحاسبة (alostaz.io)
 * ─────────────────────────────────────────────────────────────
 * ⚠️ خادمية فقط (server-only): تُستخدم داخل مسار API فقط لأنها تقرأ
 *    التوكن السرّي من process.env.ALOSTAZ_API_TOKEN. لا تستوردها في كود المتصفح.
 *
 * تتولّى: بناء الترويسات + إيجاد/إنشاء العميل + إنشاء الفاتورة من طلب مسلّم.
 * النطاق: فرع التفصيل (الفساتين) فقط.
 */

import {
  ALOSTAZ_BASE_URL,
  ALOSTAZ_BRANCH_ID,
  ALOSTAZ_PARTNER_LIST_ID,
  ALOSTAZ_STOREHOUSE_ID,
  ALOSTAZ_SERVICE_PRODUCT_ID,
  ALOSTAZ_VAT_TAX_ID,
  ALOSTAZ_API_VERSION,
  ALOSTAZ_LOCALE,
  ALOSTAZ_TREASURY_CASH,
  ALOSTAZ_TREASURY_BANK,
  ALOSTAZ_INVOICE_STATUS,
  ALOSTAZ_FABRICS_INVOICE_STATUS,
  ALOSTAZ_FABRICS_BRANCH_NAME,
  ALOSTAZ_FABRICS_STOREHOUSE_NAME,
  ALOSTAZ_FABRICS_VAT_TAX_ID,
  ALOSTAZ_QUANTITY_SCALE,
  toHalalas,
  normalizePhone,
} from '../alostaz-config'

// ── الحقول التي نحتاجها من الطلب لإنشاء الفاتورة ──────────────
export interface AlostazOrderInput {
  order_number?: string | null
  client_name: string
  client_phone?: string | null
  description?: string | null
  price: number
  paid_amount?: number | null
  payment_method?: string | null // 'cash' | 'card' | 'bank_transfer' | 'check' ...
  due_date?: string | null
}

export interface AlostazInvoiceResult {
  invoice_id: number
  invoice_code: string
  customer_id: number
  is_draft: boolean
}

/** الحصول على التوكن السرّي أو رمي خطأ واضح. */
function getToken(): string {
  const token = process.env.ALOSTAZ_API_TOKEN
  if (!token) {
    throw new Error(
      'ALOSTAZ_API_TOKEN غير مضبوط في متغيّرات البيئة (server env). أضِفه ثم أعد التشغيل.'
    )
  }
  return token
}

/** ترويسات الأستاذ القياسية. */
function alostazHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Locale': ALOSTAZ_LOCALE,
    'X-API-Version': ALOSTAZ_API_VERSION,
    'X-Branch-Id': String(ALOSTAZ_BRANCH_ID),
  }
}

/** نداء منخفض المستوى للأستاذ مع معالجة أخطاء موحّدة. */
async function alostazFetch(path: string, init?: RequestInit): Promise<any> {
  const url = `${ALOSTAZ_BASE_URL}${path}`
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { ...alostazHeaders(), ...(init?.headers || {}) } })
  } catch (err: any) {
    throw new Error(`تعذّر الاتصال بخادم الأستاذ: ${err?.message || err}`)
  }

  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!res.ok) {
    const msg =
      (body && (body.message || body.error)) ||
      (typeof body === 'string' ? body : '') ||
      `HTTP ${res.status}`
    throw new Error(`الأستاذ رفض الطلب (${res.status}): ${msg}`)
  }

  return body
}

// ── العملاء (partners) ───────────────────────────────────────

/**
 * إيجاد عميل بالهاتف أو إنشاؤه، وإرجاع معرّفه في الأستاذ.
 * البحث في الأستاذ غير مدعوم فعلياً، لذا نجلب القائمة ونطابق محلياً بالهاتف.
 */
export async function findOrCreateCustomer(
  input: {
    name: string
    phone?: string | null
  },
  opts?: { branchId?: number; partnerListId?: number }
): Promise<number> {
  const wantedPhone = normalizePhone(input.phone)
  const wantedName = String(input.name || '').trim()
  // عند تحديد فرع (فرع الأقمشة مثلاً) نوجّه نداءات العميل لذلك الفرع
  const branchHeaders = opts?.branchId ? { 'X-Branch-Id': String(opts.branchId) } : undefined
  const partnerListId = opts?.partnerListId ?? ALOSTAZ_PARTNER_LIST_ID

  // 1) محاولة الإيجاد لتفادي التكرار:
  //    - إن وُجد هاتف: نطابق بالهاتف.
  //    - إن لم يوجد هاتف (بيع نقدي باسم فقط): نطابق بالاسم كبديل.
  if (wantedPhone || wantedName) {
    const list = await alostazFetch('/partners', branchHeaders ? { headers: branchHeaders } : undefined)
    const partners: any[] = Array.isArray(list?.data) ? list.data : []
    for (const p of partners) {
      if (wantedPhone) {
        const contacts: any[] = Array.isArray(p?.contacts) ? p.contacts : []
        const match = contacts.some(
          (c) =>
            normalizePhone(c?.phone) === wantedPhone ||
            normalizePhone(c?.mobile) === wantedPhone
        )
        if (match && p?.id) return Number(p.id)
      } else if (wantedName && String(p?.name || '').trim() === wantedName && p?.id) {
        // مطابقة بالاسم فقط عند غياب الهاتف (تفادي إنشاء عملاء مكررين)
        return Number(p.id)
      }
    }
  }

  // 2) الإنشاء
  const contacts =
    input.phone && String(input.phone).trim()
      ? [{ phone: String(input.phone).trim(), mobile: String(input.phone).trim() }]
      : []

  const created = await alostazFetch('/partners', {
    method: 'POST',
    ...(branchHeaders ? { headers: branchHeaders } : {}),
    body: JSON.stringify({
      type: 'client',
      name: input.name || 'عميل',
      nature: 'individual',
      partner_list_id: partnerListId,
      contacts,
    }),
  })

  if (!created?.id) {
    throw new Error('فشل إنشاء العميل في الأستاذ (لم يُرجَع معرّف).')
  }
  return Number(created.id)
}

// ── الفواتير ─────────────────────────────────────────────────

/**
 * الخزنة المناسبة حسب طريقة الدفع:
 * نقدي (أو غير محدّد) → الخزنة النقدية؛ أي طريقة أخرى (شبكة/تحويل/شيك) → البنك.
 */
function treasuryForPaymentMethod(method?: string | null): number {
  return method && method !== 'cash' ? ALOSTAZ_TREASURY_BANK : ALOSTAZ_TREASURY_CASH
}

/**
 * إنشاء فاتورة مبيعات في الأستاذ من طلب مسلّم.
 * - المبلغ الكامل = price، والمدفوع = paid_amount (العربون).
 * - منتج ثابت «أجرة تفصيل فستان»، بدون ضريبة.
 * - opts.forceStatus: يتجاوز ALOSTAZ_INVOICE_STATUS (يُستخدم لفرض «مسودة» على الإرسال التلقائي).
 */
export async function createInvoiceForOrder(
  order: AlostazOrderInput,
  opts?: {
    forceStatus?: 'issued' | 'draft'
    /** دفعات صريحة (كاش/شبكة) بدل الدفعة الواحدة الافتراضية — تسمح بتقسيم كاش+شبكة */
    payments?: Array<{ amount: number; method: 'cash' | 'card' }>
  }
): Promise<AlostazInvoiceResult> {
  const customerId = await findOrCreateCustomer({
    name: order.client_name,
    phone: order.client_phone,
  })

  const nowIso = new Date().toISOString()
  const dueIso = order.due_date ? new Date(order.due_date).toISOString() : nowIso

  const lineDescription = order.description?.trim() || 'أجرة تفصيل فستان'

  const invoiceStatus = opts?.forceStatus ?? ALOSTAZ_INVOICE_STATUS
  const isDraft = invoiceStatus === 'draft'
  const paid = Number(order.paid_amount) || 0

  const body: Record<string, any> = {
    variant: 'standard',
    nature: 'sale',
    type: 'invoice',
    status: invoiceStatus,
    issue_date: nowIso,
    due_date: dueIso,
    partner_id: customerId,
    partner_order_code: order.order_number || undefined,
    // ملاحظات الفاتورة تُترك فارغة عمداً (بطلب المستخدم — لا يُكتب رقم الطلب فيها)
    line_items: [
      {
        product_id: ALOSTAZ_SERVICE_PRODUCT_ID,
        storehouse_id: ALOSTAZ_STOREHOUSE_ID,
        description: lineDescription,
        unit_quantity: ALOSTAZ_QUANTITY_SCALE, // الكمية 1 (المقياس ×1000)
        unit_price: toHalalas(order.price),
        unit_content: 1,
        // ضريبة القيمة المضافة الشاملة (السعر شامل الضريبة). null → بدون ضريبة
        ...(ALOSTAZ_VAT_TAX_ID ? { taxes: [{ id: ALOSTAZ_VAT_TAX_ID }] } : {}),
      },
    ],
  }

  // الدفعات تُضاف فقط في الوضع الحقيقي — الأستاذ يمنع الدفعات على المسودة.
  // إن مُرِّرت دفعات صريحة (كاش/شبكة) نستخدمها (تسمح بتقسيم كاش+شبكة لخزائن مختلفة)،
  // وإلا نُنشئ دفعة واحدة من paid عبر خزنة طريقة الدفع.
  if (!isDraft) {
    const explicit = (opts?.payments || [])
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({
        amount: toHalalas(Number(p.amount)),
        treasury_id: treasuryForPaymentMethod(p.method),
      }))
    if (explicit.length) {
      body.payments = explicit
    } else if (paid > 0) {
      body.payments = [
        {
          amount: toHalalas(paid),
          treasury_id: treasuryForPaymentMethod(order.payment_method),
        },
      ]
    }
  }

  const created = await alostazFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!created?.id) {
    throw new Error('فشل إنشاء الفاتورة في الأستاذ (لم يُرجَع معرّف).')
  }

  return {
    invoice_id: Number(created.id),
    invoice_code: String(created.code || ''),
    customer_id: customerId,
    is_draft: isDraft,
  }
}

// ── سياق فرع الأقمشة (بروكار الشرقية) في الأستاذ ──────────────

export interface AlostazBranchContext {
  branchId: number
  storehouseId: number
  treasuryCash: number
  treasuryBank: number
  partnerListId: number
}

/** تطبيع استجابات الأستاذ إلى مصفوفة (تتعامل مع {data:[...]} أو المصفوفة المباشرة). */
function toList(res: any): any[] {
  if (Array.isArray(res?.data)) return res.data
  if (Array.isArray(res)) return res
  return []
}

// تخزين مؤقت لسياق الفرع طوال عمر عملية الخادم (يُمسح بإعادة النشر)
let fabricsBranchCtxCache: AlostazBranchContext | null = null

/**
 * تحديد سياق فرع الأقمشة (بروكار الشرقية) في الأستاذ:
 *   معرّف الفرع + مستودعه + خزائنه (نقد/بنك) + قائمة الشركاء.
 * يُكتشف الفرع تلقائياً بمطابقة الاسم، ثم يُجلب مستودعه وخزائنه ضمن ترويسة ذلك الفرع.
 * يمكن تثبيت أي رقم عبر متغيّرات البيئة لتجاوز الاكتشاف التلقائي.
 */
export async function getFabricsBranchContext(): Promise<AlostazBranchContext> {
  if (fabricsBranchCtxCache) return fabricsBranchCtxCache

  // 1) معرّف الفرع (بروكار الشرقية)
  let branchId = Number(process.env.ALOSTAZ_FABRICS_BRANCH_ID) || 0
  if (!branchId) {
    const branches = toList(await alostazFetch('/branches'))
    const match = branches.find((b: any) =>
      String(b?.name || '').includes(ALOSTAZ_FABRICS_BRANCH_NAME)
    )
    if (!match?.id) {
      throw new Error(
        `تعذّر إيجاد فرع «${ALOSTAZ_FABRICS_BRANCH_NAME}» في الأستاذ. تأكد من اسم الفرع أو اضبط ALOSTAZ_FABRICS_BRANCH_ID.`
      )
    }
    branchId = Number(match.id)
  }
  const branchHeaders = { 'X-Branch-Id': String(branchId) }

  // 2) المستودع الخاص بالفرع — يُفضَّل «مستودع بروكار الشرقية» بمطابقة الاسم
  let storehouseId = Number(process.env.ALOSTAZ_FABRICS_STOREHOUSE_ID) || 0
  if (!storehouseId) {
    const items = toList(await alostazFetch('/storehouses', { headers: branchHeaders }))
    const scoped = items.filter((s: any) => s?.branch_id == null || Number(s.branch_id) === branchId)
    const pool = scoped.length ? scoped : items
    // الأولوية للمستودع الذي يحمل اسم بروكار (ضمن الفرع أولاً ثم عموماً)
    const byName =
      pool.find((s: any) => String(s?.name || '').includes(ALOSTAZ_FABRICS_STOREHOUSE_NAME)) ||
      items.find((s: any) => String(s?.name || '').includes(ALOSTAZ_FABRICS_STOREHOUSE_NAME))
    const pick = byName || pool[0]
    if (!pick?.id) {
      throw new Error('تعذّر إيجاد مستودع لفرع الأقمشة في الأستاذ. اضبط ALOSTAZ_FABRICS_STOREHOUSE_ID.')
    }
    storehouseId = Number(pick.id)
  }

  // 3) الخزائن (نقد/بنك) الخاصة بالفرع
  let treasuryCash = Number(process.env.ALOSTAZ_FABRICS_TREASURY_CASH) || 0
  let treasuryBank = Number(process.env.ALOSTAZ_FABRICS_TREASURY_BANK) || 0
  if (!treasuryCash || !treasuryBank) {
    const items = toList(await alostazFetch('/treasuries', { headers: branchHeaders }))
    const scoped = items.filter((t: any) => t?.branch_id == null || Number(t.branch_id) === branchId)
    const pool = scoped.length ? scoped : items
    const isCash = (t: any) => /safe|cash|نقد/i.test(`${t?.type ?? ''} ${t?.name ?? ''}`)
    const isBank = (t: any) => /bank|بنك|شبك/i.test(`${t?.type ?? ''} ${t?.name ?? ''}`)
    if (!treasuryCash) treasuryCash = Number((pool.find(isCash) || pool[0])?.id) || 0
    if (!treasuryBank) {
      treasuryBank = Number((pool.find(isBank) || pool.find(isCash) || pool[0])?.id) || treasuryCash
    }
    if (!treasuryCash) treasuryCash = treasuryBank
  }

  // 4) قائمة الشركاء (غالباً على مستوى الشركة — الافتراضي 1)
  const partnerListId =
    Number(process.env.ALOSTAZ_FABRICS_PARTNER_LIST_ID) || ALOSTAZ_PARTNER_LIST_ID

  fabricsBranchCtxCache = { branchId, storehouseId, treasuryCash, treasuryBank, partnerListId }
  return fabricsBranchCtxCache
}

// ── منتجات الأقمشة ───────────────────────────────────────────

/**
 * إنشاء منتج قماش في الأستاذ وإرجاع معرّفه.
 * منتجات الأقمشة تُنشأ «مع تتبّع المخزون» (supports_inventory=1) لتُخزَّن في
 * مستودع بروكار الشرقية، ولذلك يشترط الأستاذ سعر الشراء وسعر البيع للوحدة.
 * الأسعار تُرسَل بالهللات (×100). branchId ينشئ المنتج ضمن فرع الأقمشة.
 */
export async function createProduct(
  name: string,
  opts?: {
    branchId?: number
    supportsInventory?: boolean
    purchasePrice?: number | null
    salePrice?: number | null
  }
): Promise<number> {
  const headers = opts?.branchId ? { 'X-Branch-Id': String(opts.branchId) } : undefined
  const created = await alostazFetch('/products', {
    method: 'POST',
    ...(headers ? { headers } : {}),
    body: JSON.stringify({
      name: String(name || 'قماش').trim() || 'قماش',
      supports_inventory: opts?.supportsInventory ? 1 : 0,
      units: [
        {
          content: 1,
          purchase_price: toHalalas(opts?.purchasePrice ?? 0),
          sale_price: toHalalas(opts?.salePrice ?? 0),
        },
      ],
    }),
  })

  if (!created?.id) {
    throw new Error('فشل إنشاء المنتج في الأستاذ (لم يُرجَع معرّف).')
  }
  return Number(created.id)
}

// ── فواتير مبيعات الأقمشة ────────────────────────────────────

/** بند قماش واحد داخل فاتورة الأقمشة (تدعم عدّة أقمشة في فاتورة واحدة). */
export interface AlostazFabricSaleLine {
  /** معرّف المنتج المقابل للقماش في الأستاذ (يُحضَّر مسبقاً في مسار الـ API) */
  product_id: number
  /** الكمية الفعلية بالمتر (تُرسَل كـ unit_quantity؛ الافتراضي 1 عند غيابها) */
  quantity_meters?: number | null
  /** إجمالي هذا البند شامل الضريبة (بالريال) — سعر المتر = amount ÷ quantity_meters */
  amount: number
  /** وصف البند (اسم القماش عادةً) */
  description?: string | null
}

export interface AlostazFabricSaleInput {
  /** رقم الفاتورة التسلسلي المحلي (يُرسَل كمرجع partner_order_code) */
  invoice_number?: number | string | null
  /** اسم العميل (اختياري — بديله «عميل جديد») */
  customer_name?: string | null
  customer_phone?: string | null
  /** 'cash' | 'network' */
  payment_method?: string | null
  /** تاريخ الفاتورة */
  date?: string | null
  /** بنود القماش (قماش واحد أو أكثر) — كل بند بكميته الفعلية بالمتر */
  lines: AlostazFabricSaleLine[]
}

/**
 * إنشاء فاتورة مبيعات قماش في الأستاذ (تدعم عدّة أقمشة كبنود مستقلة).
 * - كل بند يُرسَل بكميته الفعلية بالمتر (unit_quantity) وسعر المتر (unit_price = إجمالي البند ÷ الكمية).
 * - المبالغ شاملة الضريبة (ضريبة القيمة المضافة الشاملة id 2 — تُستخرج من داخل السعر).
 * - المنتجات = الأقمشة من المخزون (product_id يُحضَّر لكل بند في مسار الـ API).
 * - البيع نقدي/شبكة يُدفع بالكامل عند البيع، فالدفعة = إجمالي كل البنود (في الوضع الحقيقي فقط).
 * - الملاحظات لا تُرسَل (بطلب المستخدم).
 */
export async function createInvoiceForFabricSale(
  input: AlostazFabricSaleInput
): Promise<AlostazInvoiceResult> {
  // كل نداءات فرع الأقمشة تُوجَّه لفرع بروكار الشرقية
  const ctx = await getFabricsBranchContext()
  const branchHeaders = { 'X-Branch-Id': String(ctx.branchId) }

  const customerId = await findOrCreateCustomer(
    {
      name: input.customer_name?.trim() || 'عميل جديد',
      phone: input.customer_phone,
    },
    { branchId: ctx.branchId, partnerListId: ctx.partnerListId }
  )

  const issueIso = input.date ? new Date(input.date).toISOString() : new Date().toISOString()

  const isDraft = ALOSTAZ_FABRICS_INVOICE_STATUS === 'draft'
  const lines = (input.lines || []).filter((l) => l && Number(l.amount) >= 0)
  // إجمالي الفاتورة = مجموع بنود القماش
  const amount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  // الخزنة حسب طريقة الدفع ضمن خزائن هذا الفرع
  const treasuryId =
    input.payment_method && input.payment_method !== 'cash' ? ctx.treasuryBank : ctx.treasuryCash

  const body: Record<string, any> = {
    variant: 'standard',
    nature: 'sale',
    type: 'invoice',
    status: ALOSTAZ_FABRICS_INVOICE_STATUS,
    issue_date: issueIso,
    due_date: issueIso,
    partner_id: customerId,
    partner_order_code:
      input.invoice_number != null && String(input.invoice_number).trim()
        ? String(input.invoice_number)
        : undefined,
    line_items: lines.map((l) => {
      // الكمية الفعلية بالمتر (المقياس ×1000)؛ إن غابت الكمية نعتمد الكمية 1
      const qty = Number(l.quantity_meters) > 0 ? Number(l.quantity_meters) : 1
      const unitPricePerMeter = (Number(l.amount) || 0) / qty
      return {
        product_id: l.product_id,
        storehouse_id: ctx.storehouseId,
        description: l.description?.trim() || 'بيع قماش',
        unit_quantity: Math.round(qty * ALOSTAZ_QUANTITY_SCALE),
        unit_price: toHalalas(unitPricePerMeter),
        unit_content: 1,
        ...(ALOSTAZ_FABRICS_VAT_TAX_ID ? { taxes: [{ id: ALOSTAZ_FABRICS_VAT_TAX_ID }] } : {}),
      }
    }),
  }

  // الدفعة الكاملة تُضاف في الوضع الحقيقي فقط — الأستاذ يمنع الدفعات على المسودة
  if (!isDraft && amount > 0) {
    body.payments = [
      {
        amount: toHalalas(amount),
        treasury_id: treasuryId,
      },
    ]
  }

  const created = await alostazFetch('/invoices', {
    method: 'POST',
    headers: branchHeaders,
    body: JSON.stringify(body),
  })

  if (!created?.id) {
    throw new Error('فشل إنشاء فاتورة القماش في الأستاذ (لم يُرجَع معرّف).')
  }

  return {
    invoice_id: Number(created.id),
    invoice_code: String(created.code || ''),
    customer_id: customerId,
    is_draft: isDraft,
  }
}
