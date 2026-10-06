/**
 * إرسال مبيعة أقمشة (صف income) إلى تطبيق الأستاذ — خادمي فقط.
 * ─────────────────────────────────────────────────────────────
 * مسار واحد يستعمله زر «إرسال للمحاسبة» في شاشة المحل (`/api/alostaz/send-fabric-invoice`)
 * ومهمة المتجر الإلكتروني (المرحلة 6)، فيبقى منع التكرار واحداً:
 * - حجز الإرسال ذرياً على صف المبيعة (alostaz_sync_status + alostaz_sync_token) قبل
 *   أي اتصال ينشئ الفاتورة؛ يفوز استدعاء واحد حتى لو ضغط جهازان أو عملت المهمة معاً.
 * - نتيجة مجهولة (انقطاع بعد إرسال الفاتورة) ⇒ review_required ولا إعادة تلقائية.
 * - وجود alostaz_invoice_id هو مصدر الحقيقة المشترك.
 *
 * البنود:
 * - مبيعة المحل: كما كانت حرفياً — القيمة (أو جزء الشبكة للمختلطة) موزّعة على الأقمشة بالأمتار.
 * - مبيعة المتجر الإلكتروني (مرتبطة بطلب): كل سطر بمبلغه الفعلي المدفوع (شامل حصته من
 *   الضريبة)، ورسوم الشحن بند مستقل «رسوم شحن» (قرار المالك 28 سبتمبر).
 */

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createInvoiceForFabricSale,
  createProduct,
  getFabricsBranchContext,
  isAlostazInvoiceOutcomeUnknown,
  type AlostazFabricSaleLine,
} from '@/lib/services/alostaz-service'
import {
  SHIPPING_LINE_NAME,
  planOnlineInvoiceLines,
  type OnlineItemForInvoice,
  type OnlineOrderForInvoice,
} from '@/lib/server/fabric-store/invoice-lines'

/**
 * إيجاد/إنشاء منتج القماش في الأستاذ:
 *  - نطابق صنف المخزون بالاسم (income.customer_name يخزّن اسم القماش).
 *  - نستخدم alostaz_product_id فقط إن كان تابعاً لفرع ياسمين الشام الرئيسي.
 *  - الربط القديم بفرع الأقمشة السابق يُستبدل تلقائياً عند أول إرسال.
 *  - إن لم يوجد صنف مطابق (اسم غير مسجّل) ننشئ منتجاً بالاسم دون حفظ.
 */
export async function resolveFabricProductId(admin: SupabaseClient, fabricName: string): Promise<number> {
  const name = String(fabricName || '').trim()
  const ctx = await getFabricsBranchContext()

  // صنف المخزون المطابق بالاسم (إن وُجد)
  const { data: invItem } = await admin
    .from('fabric_inventory')
    .select('*')
    .eq('name', name)
    .maybeSingle()

  if (
    invItem?.alostaz_product_id &&
    Number(invItem.alostaz_product_branch_id) === ctx.branchId
  ) {
    return Number(invItem.alostaz_product_id)
  }

  // إنشاء المنتج في الأستاذ ضمن فرع «بروكار الشرقية» مع تتبّع المخزون
  const productId = await createProduct(invItem?.name || name || 'قماش', {
    branchId: ctx.branchId,
    supportsInventory: true,
    purchasePrice: invItem?.cost_per_unit,
    salePrice: invItem?.sale_price_per_unit,
  })

  // حفظ المعرّف على صنف المخزون لإعادة استخدامه (إن وُجد الصنف)
  if (invItem?.id) {
    const { error: updateError } = await admin
      .from('fabric_inventory')
      .update({
        alostaz_product_id: productId,
        alostaz_product_branch_id: ctx.branchId,
      })
      .eq('id', invItem.id)

    if (updateError) {
      throw new Error(
        `أُنشئ منتج القماش في الأستاذ، لكن تعذّر حفظ ربطه بالفرع الرئيسي: ${updateError.message}`
      )
    }
  }

  return productId
}

const SHIPPING_PRODUCT_SETTING = 'fabric_store_alostaz_shipping_product'

/**
 * منتج خدمة «رسوم شحن» (بلا مخزون) في فرع الأقمشة: يُنشأ مرة ويُحفظ معرّفه في
 * app_settings. إن أنشأه طلبان في اللحظة نفسها يُعتمد المحفوظ أولاً ويبقى الآخر
 * منتجاً غير مستعمل في الأستاذ (لا أثر محاسبي).
 */
async function resolveShippingProductId(admin: SupabaseClient): Promise<number> {
  const ctx = await getFabricsBranchContext()
  const read = async () => {
    const { data, error } = await admin.from('app_settings').select('value').eq('key', SHIPPING_PRODUCT_SETTING).maybeSingle()
    if (error) throw new Error(`تعذّر قراءة منتج رسوم الشحن: ${error.message}`)
    const value = data?.value as { product_id?: unknown; branch_id?: unknown } | null | undefined
    return value && Number(value.branch_id) === ctx.branchId && Number(value.product_id) > 0 ? Number(value.product_id) : null
  }
  const saved = await read()
  if (saved) return saved

  const productId = await createProduct(SHIPPING_LINE_NAME, {
    branchId: ctx.branchId,
    supportsInventory: false,
    salePrice: 50,
  })
  const { error } = await admin
    .from('app_settings')
    .upsert({ key: SHIPPING_PRODUCT_SETTING, value: { product_id: productId, branch_id: ctx.branchId } },
      { onConflict: 'key', ignoreDuplicates: true })
  if (error) throw new Error(`أُنشئ منتج رسوم الشحن في الأستاذ، لكن تعذّر حفظه: ${error.message}`)
  return (await read()) ?? productId
}

/** أعمدة صف income التي يقرؤها الإرسال. */
/** customer_source that fabric_store_confirm_order writes on an online sale (stage 6). */
const ONLINE_SALE_SOURCE = 'المتجر الإلكتروني'

interface IncomeRow {
  id: string
  branch: string
  amount: number | string | null
  payment_method: string | null
  network_amount: number | string | null
  fabric_items: unknown
  customer_name: string | null
  description: string | null
  quantity_meters: number | string | null
  invoice_number: number | null
  buyer_name: string | null
  buyer_phone: string | null
  customer_source: string | null
  category: string | null
  date: string | null
  alostaz_invoice_id: number | null
  alostaz_invoice_code: string | null
}

/** بنود مبيعة المحل — كما كانت في مسار الإرسال حرفياً. */
async function shopSaleLines(admin: SupabaseClient, income: IncomeRow): Promise<AlostazFabricSaleLine[]> {
  // بنود القماش: من fabric_items إن وُجدت، وإلا بند واحد من القماش القديم
  type SaleItem = { name: string; quantity_meters: number | null }
  type StoredFabricItem = { name?: unknown; quantity_meters?: unknown }
  const rawItems: SaleItem[] =
    Array.isArray(income.fabric_items) && income.fabric_items.length > 0
      ? income.fabric_items.map((f: StoredFabricItem) => ({
          name: String(f?.name || income.customer_name || 'قماش'),
          quantity_meters: f?.quantity_meters != null ? Number(f.quantity_meters) : null,
        }))
      : [
          {
            name: income.customer_name || income.description || 'قماش',
            quantity_meters: income.quantity_meters != null ? Number(income.quantity_meters) : null,
          },
        ]

  // قيمة الفاتورة المرسلة للأستاذ: الإجمالي عادةً، أما المبيعة المختلطة
  // (كاش + شبكة) فتُرسَل بقيمة الشبكة وحدها — الكاش لا يصل للمحاسبة إطلاقاً.
  const total =
    income.payment_method === 'mixed'
      ? Math.max(Number(income.network_amount) || 0, 0)
      : Number(income.amount) || 0

  if (income.payment_method === 'mixed' && total <= 0) {
    throw new Error('لا توجد قيمة شبكة في هذه المبيعة المختلطة، فلا فاتورة تُرسَل للمحاسبة')
  }

  // توزيع قيمة الفاتورة على البنود بنسبة الأمتار، مع إعطاء الباقي للبند
  // الأخير لضمان تطابق المجموع تماماً مع القيمة المرسلة.
  const n = rawItems.length
  const meters = rawItems.map((it) => (Number(it.quantity_meters) > 0 ? Number(it.quantity_meters) : 0))
  const totalMeters = meters.reduce((s, m) => s + m, 0)
  const round2 = (v: number) => Math.round(v * 100) / 100

  const allocated: number[] = new Array(n).fill(0)
  if (n === 1) {
    allocated[0] = total
  } else if (totalMeters > 0) {
    let acc = 0
    for (let i = 0; i < n - 1; i++) {
      allocated[i] = round2((total * meters[i]) / totalMeters)
      acc += allocated[i]
    }
    allocated[n - 1] = round2(total - acc)
  } else {
    // لا كميات مُدخلة: توزيع بالتساوي
    const each = round2(total / n)
    let acc = 0
    for (let i = 0; i < n - 1; i++) {
      allocated[i] = each
      acc += each
    }
    allocated[n - 1] = round2(total - acc)
  }

  // تجهيز منتج الأستاذ لكل قماش + بناء بند بكميته الفعلية بالمتر
  const lines: AlostazFabricSaleLine[] = []
  for (let i = 0; i < n; i++) {
    const productId = await resolveFabricProductId(admin, rawItems[i].name)
    lines.push({
      product_id: productId,
      quantity_meters: rawItems[i].quantity_meters,
      amount: allocated[i],
      description: rawItems[i].name,
    })
  }
  return lines
}

interface OnlineOrderRow extends OnlineOrderForInvoice {
  id: string
}

/**
 * بنود مبيعة المتجر الإلكتروني (الحساب في `planOnlineInvoiceLines`). أي عدم اتساق مع
 * صف المبيعة يُوقف الإرسال **قبل** إنشاء الفاتورة (فشل صريح، لا نتيجة مجهولة).
 */
async function onlineOrderLines(
  admin: SupabaseClient,
  income: IncomeRow,
  order: OnlineOrderRow
): Promise<AlostazFabricSaleLine[]> {
  const { data: items, error } = await admin
    .from('fabric_store_order_items')
    .select('line_number, stock_consumption_cm, gross_halalas, fabric_name')
    .eq('order_id', order.id)
    .order('line_number', { ascending: true })
  if (error) throw new Error(`تعذّر قراءة أسطر الطلب ${order.order_number}: ${error.message}`)

  const planned = planOnlineInvoiceLines(order, (items ?? []) as OnlineItemForInvoice[],
    Array.isArray(income.fabric_items) ? income.fabric_items : [], income.amount)

  const lines: AlostazFabricSaleLine[] = []
  for (const line of planned) {
    lines.push({
      product_id: line.kind === 'shipping'
        ? await resolveShippingProductId(admin)
        : await resolveFabricProductId(admin, line.productName),
      quantity_meters: line.quantity_meters,
      amount: line.amount,
      description: line.description,
    })
  }
  return lines
}

export type FabricInvoiceSendResult =
  | { kind: 'not_found' }
  | { kind: 'not_fabric' }
  | { kind: 'disabled' }
  | { kind: 'refunded' }
  | { kind: 'already_sent'; invoice_id: number; invoice_code: string | null }
  | { kind: 'claim_error'; error: string }
  | { kind: 'status_unknown' }
  | { kind: 'review_required' }
  | { kind: 'in_progress' }
  | { kind: 'failed'; error: string; outcomeUnknown: boolean }
  | { kind: 'sent_unsaved'; invoice_id: number; invoice_code: string; warning: string }
  | { kind: 'sent'; invoice_id: number; invoice_code: string; customer_id: number; is_draft: boolean }

/** الدفعة D (AUD-13): «sending» أقدم من هذا = إرسال قُطع في منتصفه. */
const STUCK_SENDING_MS = 10 * 60 * 1000

/** يرسل مبيعة الأقمشة للأستاذ مرة واحدة فقط (انظر رأس الملف). */
export async function sendFabricIncomeToAlostaz(
  admin: SupabaseClient,
  incomeId: string
): Promise<FabricInvoiceSendResult> {
  // جلب سجل المبيعة (نستخدم * ليشمل fabric_items بأمان حتى قبل تطبيق الهجرة 69)
  const { data: incomeData, error: incomeError } = await admin
    .from('income')
    .select('*')
    .eq('id', incomeId)
    .single()

  if (incomeError || !incomeData) return { kind: 'not_found' }
  const income = incomeData as IncomeRow
  if (income.branch !== 'fabrics') return { kind: 'not_fabric' }
  // المرحلة 8: صف مرتجع المتجر (سالب) ليس مبيعة؛ إشعاره الدائن يصدر يدوياً من الأستاذ.
  if (income.category != null && income.category !== 'fabric_sale') return { kind: 'not_fabric' }

  // منع الإرسال المكرر
  if (income.alostaz_invoice_id) {
    return { kind: 'already_sent', invoice_id: income.alostaz_invoice_id, invoice_code: income.alostaz_invoice_code }
  }

  // Fail closed before claiming or making external writes. A failed lookup does
  // not establish that this is a shop sale, even if its message names the table.
  const { data: onlineOrder, error: orderError } = await admin
    .from('fabric_store_orders')
    .select('id, order_number, total_halalas, shipping_net_halalas, shipping_vat_halalas, payment_status')
    .eq('income_id', incomeId)
    .maybeSingle()
  // The one tolerated error is the table itself being absent (stage 2 rolled back):
  // shop invoices must keep working then. Identified by code only, and never for a
  // sale the confirm function marked as online (customer_source).
  const ordersTableMissing = orderError?.code === 'PGRST205' || orderError?.code === '42P01'
  if (orderError && (!ordersTableMissing || income.customer_source === ONLINE_SALE_SOURCE)) {
    return { kind: 'failed', error: `تعذّر التحقق من مصدر المبيعة: ${orderError.message}`, outcomeUnknown: false }
  }
  // استُرد الطلب كاملاً قبل إرسال فاتورته: لا فاتورة (المبيعة ومرتجعها يتقابلان في الواردات).
  if (onlineOrder && (onlineOrder as { payment_status?: string }).payment_status === 'refunded') {
    return { kind: 'refunded' }
  }
  if (onlineOrder && (process.env.FABRIC_STORE_ALOSTAZ_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    return { kind: 'disabled' }
  }

  // حجز الإرسال ذرياً قبل أي اتصال ينشئ الفاتورة في الأستاذ.
  // يفوز استدعاء واحد فقط حتى لو ضغط جهازان في اللحظة نفسها.
  // Keep this as a count-only PATCH. PostgREST v14 miscompiles this OR filter
  // when UPDATE is chained with select()/return=representation.
  const syncAttemptToken = randomUUID()
  const { count: claimedIncomeCount, error: claimError } = await admin
    .from('income')
    .update({
      alostaz_sync_status: 'sending',
      alostaz_sync_token: syncAttemptToken,
      alostaz_sync_error: null,
      alostaz_synced_at: new Date().toISOString(),
    }, { count: 'exact' })
    .eq('id', incomeId)
    .eq('branch', 'fabrics')
    .is('alostaz_invoice_id', null)
    .or('alostaz_sync_status.is.null,alostaz_sync_status.eq.failed')

  if (claimError) return { kind: 'claim_error', error: claimError.message }

  if (claimedIncomeCount !== 1) {
    const { data: latestIncome, error: latestError } = await admin
      .from('income')
      .select('alostaz_invoice_id, alostaz_invoice_code, alostaz_sync_status, alostaz_synced_at')
      .eq('id', incomeId)
      .single()

    if (latestError || !latestIncome) return { kind: 'status_unknown' }
    if (latestIncome.alostaz_invoice_id) {
      return { kind: 'already_sent', invoice_id: latestIncome.alostaz_invoice_id, invoice_code: latestIncome.alostaz_invoice_code }
    }
    if (latestIncome.alostaz_sync_status === 'review_required') return { kind: 'review_required' }
    // الدفعة D (AUD-13): إرسال قُطع بعد الحجز (مهلة الخادم) يترك «sending» للأبد، فتموت المهمة.
    // بعد 10 دقائق يصير «مراجعة» — لا «فشل»: الفاتورة ربما أُنشئت، وإعادة الإرسال قد تكررها.
    const stuckSince = Date.parse(String(latestIncome.alostaz_synced_at ?? ''))
    if (latestIncome.alostaz_sync_status === 'sending' && Number.isFinite(stuckSince)
        && Date.now() - stuckSince > STUCK_SENDING_MS) {
      const { count: markedCount, error: markError } = await admin
        .from('income')
        .update({
          alostaz_sync_status: 'review_required',
          alostaz_sync_error: 'توقف الإرسال في منتصفه (انقطاع أو مهلة) — تحقّقي في الأستاذ هل أُنشئت الفاتورة قبل أي إعادة',
        }, { count: 'exact' })
        .eq('id', incomeId)
        .eq('alostaz_sync_status', 'sending')
        .lt('alostaz_synced_at', new Date(Date.now() - STUCK_SENDING_MS).toISOString())
      // (المراجعة) لا يُعلن «مراجعة» إلا إن كُتبت فعلاً؛ وإلا تغيّر الصف بين القراءة والكتابة (أنهاه الإرسال نفسه)
      return markError || markedCount !== 1 ? { kind: 'in_progress' } : { kind: 'review_required' }
    }
    return { kind: 'in_progress' }
  }

  // تجهيز البنود + إنشاء الفاتورة في الأستاذ
  let result
  try {
    const lines = onlineOrder
      ? await onlineOrderLines(admin, income, onlineOrder as OnlineOrderRow)
      : await shopSaleLines(admin, income)

    result = await createInvoiceForFabricSale({
      invoice_number: income.invoice_number,
      customer_name: income.buyer_name,
      customer_phone: income.buyer_phone,
      // المبيعة المختلطة تُرسَل بجزء الشبكة فقط، فخزنتها في الأستاذ خزنة الشبكة
      payment_method: income.payment_method === 'mixed' ? 'network' : income.payment_method,
      date: income.date,
      lines,
    })
  } catch (err: unknown) {
    const outcomeUnknown = isAlostazInvoiceOutcomeUnknown(err)
    const errorMessage = err instanceof Error ? err.message : 'فشل إرسال الفاتورة للأستاذ'
    const { error: failureUpdateError } = await admin
      .from('income')
      .update({
        alostaz_sync_status: outcomeUnknown ? 'review_required' : 'failed',
        alostaz_sync_error: errorMessage,
        alostaz_synced_at: new Date().toISOString(),
      })
      .eq('id', incomeId)
      .eq('alostaz_sync_token', syncAttemptToken)
      .eq('alostaz_sync_status', 'sending')

    if (failureUpdateError) {
      console.error('Failed to persist fabric invoice failure state:', failureUpdateError)
    }
    return { kind: 'failed', error: errorMessage, outcomeUnknown }
  }

  // حفظ النتيجة حتى للمسودة؛ وجود المعرّف هو مصدر الحقيقة المشترك
  // بين جميع الأجهزة ويمنع ظهور زر إرسال جديد على هاتف آخر.
  let updateError: { message: string } | null = null
  let finalized = false
  for (let attempt = 0; attempt < 3 && !finalized; attempt++) {
    const { data: finalizedIncome, error } = await admin
      .from('income')
      .update({
        alostaz_customer_id: result.customer_id,
        alostaz_invoice_id: result.invoice_id,
        alostaz_invoice_code: result.invoice_code,
        alostaz_sync_status: 'sent',
        alostaz_sync_error: null,
        alostaz_synced_at: new Date().toISOString(),
      })
      .eq('id', incomeId)
      .eq('alostaz_sync_token', syncAttemptToken)
      .select('id')
      .maybeSingle()

    updateError = error
    finalized = !!finalizedIncome
  }

  if (updateError || !finalized) {
    // الفاتورة أُنشئت في الأستاذ لكن فشل حفظ المرجع محلياً — نُبلّغ بذلك
    return {
      kind: 'sent_unsaved',
      invoice_id: result.invoice_id,
      invoice_code: result.invoice_code,
      warning:
        'أُنشئت الفاتورة في الأستاذ لكن تعذّر حفظ المرجع محلياً. أُبقي حجز الحماية فعالاً لمنع إعادة إرسالها.' +
        (updateError?.message ? ' ' + updateError.message : ''),
    }
  }

  return {
    kind: 'sent',
    invoice_id: result.invoice_id,
    invoice_code: result.invoice_code,
    customer_id: result.customer_id,
    is_draft: result.is_draft,
  }
}
