import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createInvoiceForFabricSale, createProduct, getFabricsBranchContext } from '@/lib/services/alostaz-service'

/**
 * مسار خادمي لإرسال فاتورة مبيعة قماش إلى تطبيق الأستاذ للمحاسبة.
 * ─────────────────────────────────────────────────────────────
 * - التوكن السرّي (ALOSTAZ_API_TOKEN) يبقى هنا في الخادم ولا يصل للمتصفح.
 * - يتحقق أن المستخدم مدير (admin) قبل التنفيذ.
 * - يجهّز منتج القماش في الأستاذ (يُنشأ مرة واحدة ويُخزَّن alostaz_product_id
 *   على صنف المخزون المطابق بالاسم) ثم يُعيد استخدامه لاحقاً.
 * - يمنع الإرسال المكرر (idempotent) عبر عمود income.alostaz_invoice_id.
 * - يحدّث سجل المبيعة بمعرّف الفاتورة/العميل وحالة المزامنة.
 */

// عميل Admin (Service Role) لقراءة/تحديث السجلات بتجاوز RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * إيجاد/إنشاء منتج القماش في الأستاذ:
 *  - نطابق صنف المخزون بالاسم (income.customer_name يخزّن اسم القماش).
 *  - إن كان للصنف alostaz_product_id نستخدمه، وإلا ننشئ المنتج ونحفظ المعرّف.
 *  - إن لم يوجد صنف مطابق (اسم غير مسجّل) ننشئ منتجاً بالاسم دون حفظ.
 */
async function resolveFabricProductId(fabricName: string): Promise<number> {
  const name = String(fabricName || '').trim()

  // صنف المخزون المطابق بالاسم (إن وُجد)
  const { data: invItem } = await supabaseAdmin
    .from('fabric_inventory')
    .select('id, name, cost_per_unit, sale_price_per_unit, alostaz_product_id')
    .eq('name', name)
    .maybeSingle()

  if (invItem?.alostaz_product_id) {
    return Number(invItem.alostaz_product_id)
  }

  // إنشاء المنتج في الأستاذ ضمن فرع الأقمشة (بروكار الشرقية) مع تتبّع المخزون
  const ctx = await getFabricsBranchContext()
  const productId = await createProduct(invItem?.name || name || 'قماش', {
    branchId: ctx.branchId,
    supportsInventory: true,
    purchasePrice: invItem?.cost_per_unit,
    salePrice: invItem?.sale_price_per_unit,
  })

  // حفظ المعرّف على صنف المخزون لإعادة استخدامه (إن وُجد الصنف)
  if (invItem?.id) {
    await supabaseAdmin
      .from('fabric_inventory')
      .update({ alostaz_product_id: productId })
      .eq('id', invItem.id)
  }

  return productId
}

export async function POST(request: NextRequest) {
  try {
    // 1) التحقق من الجلسة والصلاحية (مدير فقط)
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'غير مصرّح - لا يوجد ترويسة مصادقة' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'غير مصرّح - توكن غير صالح' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'غير مسموح - للمدير فقط' }, { status: 403 })
    }

    // 2) قراءة معرّف المبيعة
    const { incomeId } = await request.json()
    if (!incomeId) {
      return NextResponse.json({ error: 'incomeId مطلوب' }, { status: 400 })
    }

    // 3) جلب سجل المبيعة (نستخدم * ليشمل fabric_items بأمان حتى قبل تطبيق الهجرة 69)
    const { data: income, error: incomeError } = await supabaseAdmin
      .from('income')
      .select('*')
      .eq('id', incomeId)
      .single()

    if (incomeError || !income) {
      return NextResponse.json({ error: 'المبيعة غير موجودة' }, { status: 404 })
    }

    if (income.branch !== 'fabrics') {
      return NextResponse.json({ error: 'هذا المسار خاص بمبيعات الأقمشة فقط' }, { status: 400 })
    }

    // 4) منع الإرسال المكرر
    if (income.alostaz_invoice_id) {
      return NextResponse.json({
        data: {
          alreadySent: true,
          invoice_id: income.alostaz_invoice_id,
          invoice_code: income.alostaz_invoice_code,
        },
        error: null,
      })
    }

    // 5) تجهيز بنود القماش (قماش واحد أو أكثر) + إنشاء الفاتورة في الأستاذ
    let result
    try {
      // بنود القماش: من fabric_items إن وُجدت، وإلا بند واحد من القماش القديم
      type SaleItem = { name: string; quantity_meters: number | null }
      const rawItems: SaleItem[] =
        Array.isArray(income.fabric_items) && income.fabric_items.length > 0
          ? income.fabric_items.map((f: any) => ({
              name: String(f?.name || income.customer_name || 'قماش'),
              quantity_meters: f?.quantity_meters != null ? Number(f.quantity_meters) : null,
            }))
          : [
              {
                name: income.customer_name || income.description || 'قماش',
                quantity_meters: income.quantity_meters != null ? Number(income.quantity_meters) : null,
              },
            ]

      // توزيع الإجمالي الكلّي (المبلغ الواحد) على البنود بنسبة الأمتار،
      // مع إعطاء الباقي للبند الأخير لضمان تطابق المجموع تماماً مع الإجمالي.
      const total = Number(income.amount) || 0
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
      const lines = []
      for (let i = 0; i < n; i++) {
        const productId = await resolveFabricProductId(rawItems[i].name)
        lines.push({
          product_id: productId,
          quantity_meters: rawItems[i].quantity_meters,
          amount: allocated[i],
          description: rawItems[i].name,
        })
      }

      result = await createInvoiceForFabricSale({
        invoice_number: income.invoice_number,
        customer_name: income.buyer_name,
        customer_phone: income.buyer_phone,
        payment_method: income.payment_method,
        date: income.date,
        lines,
      })
    } catch (err: any) {
      // تسجيل حالة الفشل (بدون معرّف فاتورة → يمكن إعادة المحاولة)
      await supabaseAdmin
        .from('income')
        .update({ alostaz_sync_status: 'failed', alostaz_synced_at: new Date().toISOString() })
        .eq('id', incomeId)
      return NextResponse.json({ error: err?.message || 'فشل إرسال الفاتورة للأستاذ' }, { status: 502 })
    }

    // وضع الاختبار (مسودة): لا نُعلّم المبيعة كـ«مُرسَلة» حتى يبقى الإرسال الحقيقي متاحاً لاحقاً
    if (result.is_draft) {
      return NextResponse.json({
        data: {
          invoice_id: result.invoice_id,
          invoice_code: result.invoice_code,
          customer_id: result.customer_id,
          draft: true,
        },
        error: null,
      })
    }

    // 6) حفظ النتيجة على المبيعة
    const { error: updateError } = await supabaseAdmin
      .from('income')
      .update({
        alostaz_customer_id: result.customer_id,
        alostaz_invoice_id: result.invoice_id,
        alostaz_invoice_code: result.invoice_code,
        alostaz_sync_status: 'sent',
        alostaz_synced_at: new Date().toISOString(),
      })
      .eq('id', incomeId)

    if (updateError) {
      // الفاتورة أُنشئت في الأستاذ لكن فشل حفظ المرجع محلياً — نُبلّغ بذلك
      return NextResponse.json(
        {
          data: { invoice_id: result.invoice_id, invoice_code: result.invoice_code },
          warning: 'أُنشئت الفاتورة في الأستاذ لكن تعذّر حفظ المرجع محلياً: ' + updateError.message,
          error: null,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      data: {
        invoice_id: result.invoice_id,
        invoice_code: result.invoice_code,
        customer_id: result.customer_id,
      },
      error: null,
    })
  } catch (error: any) {
    console.error('❌ send-fabric-invoice error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
