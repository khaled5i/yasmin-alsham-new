/**
 * خدمة الربط مع تطبيق الأستاذ للمحاسبة (alostaz.io)
 * ─────────────────────────────────────────────────────────────
 * ⚠️ خادمية فقط (server-only): تُستخدم داخل مسار API فقط لأنها تقرأ
 *    التوكن السرّي من process.env.ALOSTAZ_API_TOKEN. لا تستوردها في كود المتصفح.
 *
 * تتولّى: بناء الترويسات + إيجاد/إنشاء العميل + إنشاء فواتير التفصيل والأقمشة.
 * كل الفواتير الخارجية تُوجَّه إلى الفرع الرئيسي، مع بقاء الفصل الداخلي في الموقع.
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

class AlostazRequestError extends Error {
  constructor(
    message: string,
    readonly invoiceOutcomeUnknown: boolean = false
  ) {
    super(message)
    this.name = 'AlostazRequestError'
  }
}

/**
 * Returns true when an invoice POST may have reached Alostaz but its response
 * was not confirmed. Retrying automatically could create a duplicate invoice.
 */
export function isAlostazInvoiceOutcomeUnknown(error: unknown): boolean {
  return error instanceof AlostazRequestError && error.invoiceOutcomeUnknown
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
  const isInvoiceCreation =
    path === '/invoices' && String(init?.method || 'GET').toUpperCase() === 'POST'
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { ...alostazHeaders(), ...(init?.headers || {}) } })
  } catch (err: any) {
    throw new AlostazRequestError(
      `تعذّر الاتصال بخادم الأستاذ: ${err?.message || err}`,
      isInvoiceCreation
    )
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
    throw new AlostazRequestError(
      `الأستاذ رفض الطلب (${res.status}): ${msg}`,
      isInvoiceCreation && res.status >= 500
    )
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
    throw new AlostazRequestError(
      'فشل إنشاء الفاتورة في الأستاذ (لم يُرجَع معرّف).',
      true
    )
  }

  return {
    invoice_id: Number(created.id),
    invoice_code: String(created.code || ''),
    customer_id: customerId,
    is_draft: isDraft,
  }
}

// ── سياق الأقمشة في الفرع الرئيسي «ياسمين الشام» في الأستاذ ───

export interface AlostazBranchContext {
  branchId: number
  storehouseId: number
  treasuryCash: number
  treasuryBank: number
  partnerListId: number
}

/**
 * سياق إرسال فواتير الأقمشة إلى الأستاذ.
 * نستخدم عمداً نفس الفرع والمستودع والخزائن وقائمة الشركاء الخاصة بياسمين الشام،
 * حتى لا يحتاج الحساب الخارجي إلى فرع ثانٍ. هذا لا يغيّر قيمة branch المحلية
 * ولا فصل الحسابات أو تصميم الفواتير داخل الموقع.
 */
export async function getFabricsBranchContext(): Promise<AlostazBranchContext> {
  return {
    branchId: ALOSTAZ_BRANCH_ID,
    storehouseId: ALOSTAZ_STOREHOUSE_ID,
    treasuryCash: ALOSTAZ_TREASURY_CASH,
    treasuryBank: ALOSTAZ_TREASURY_BANK,
    partnerListId: ALOSTAZ_PARTNER_LIST_ID,
  }
}

// ── منتجات الأقمشة ───────────────────────────────────────────

/**
 * إنشاء منتج قماش في الأستاذ وإرجاع معرّفه.
 * منتجات الأقمشة تُنشأ «مع تتبّع المخزون» (supports_inventory=1) لتُخزَّن في
 * مستودع ياسمين الشام الرئيسي، ولذلك يشترط الأستاذ سعر الشراء وسعر البيع للوحدة.
 * الأسعار تُرسَل بالهللات (×100). branchId ينشئ المنتج ضمن الفرع الرئيسي.
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
  // الأستاذ يرفض إنشاء أي وحدة منتج إذا كان سعر الشراء أو البيع أقل من هللة واحدة.
  // بعض أصناف المخزون القديمة لا تحتوي سعراً، لذلك نرسل 1 هللة كحد تقني أدنى.
  // هذا السعر الافتراضي خاص ببطاقة المنتج فقط؛ سعر بند الفاتورة الفعلي يُرسل لاحقاً
  // من قيمة المبيعة ولا يتأثر بهذا الحد الأدنى.
  const purchasePriceHalalas = Math.max(1, toHalalas(opts?.purchasePrice))
  const salePriceHalalas = Math.max(1, toHalalas(opts?.salePrice))

  const created = await alostazFetch('/products', {
    method: 'POST',
    ...(headers ? { headers } : {}),
    body: JSON.stringify({
      name: String(name || 'قماش').trim() || 'قماش',
      supports_inventory: opts?.supportsInventory ? 1 : 0,
      units: [
        {
          content: 1,
          purchase_price: purchasePriceHalalas,
          sale_price: salePriceHalalas,
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
  // فواتير الأقمشة تُوجَّه إلى نفس فرع ياسمين الشام المستخدم لفواتير التفصيل.
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
    throw new AlostazRequestError(
      'فشل إنشاء فاتورة القماش في الأستاذ (لم يُرجَع معرّف).',
      true
    )
  }

  return {
    invoice_id: Number(created.id),
    invoice_code: String(created.code || ''),
    customer_id: customerId,
    is_draft: isDraft,
  }
}
