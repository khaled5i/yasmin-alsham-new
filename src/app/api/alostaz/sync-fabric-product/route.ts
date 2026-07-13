import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createProduct, getFabricsBranchContext } from '@/lib/services/alostaz-service'

/**
 * مسار خادمي لإضافة صنف مخزون قماش كمنتج في تطبيق الأستاذ (فرع بروكار الشرقية).
 * ─────────────────────────────────────────────────────────────
 * يُستدعى عند إضافة صنف جديد للمخزون في الموقع، فيُنشئ المنتج المقابل في الأستاذ
 * ويحفظ alostaz_product_id على الصنف لإعادة استخدامه في الفواتير لاحقاً.
 * - للمدير فقط (يحمل التوكن السرّي في الخادم).
 * - idempotent: إن كان للصنف معرّف منتج مسبقاً لا يُعاد الإنشاء.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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

    // 2) قراءة معرّف صنف المخزون
    const { inventoryItemId } = await request.json()
    if (!inventoryItemId) {
      return NextResponse.json({ error: 'inventoryItemId مطلوب' }, { status: 400 })
    }

    // 3) جلب الصنف
    const { data: item, error: itemError } = await supabaseAdmin
      .from('fabric_inventory')
      .select('id, name, cost_per_unit, sale_price_per_unit, alostaz_product_id')
      .eq('id', inventoryItemId)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ error: 'صنف المخزون غير موجود' }, { status: 404 })
    }

    // 4) منع الإنشاء المكرر
    if (item.alostaz_product_id) {
      return NextResponse.json({
        data: { alreadySynced: true, product_id: item.alostaz_product_id },
        error: null,
      })
    }

    // 5) إنشاء المنتج في الأستاذ ضمن فرع الأقمشة، ثم حفظ المعرّف
    let productId: number
    try {
      const ctx = await getFabricsBranchContext()
      productId = await createProduct(item.name || 'قماش', {
        branchId: ctx.branchId,
        supportsInventory: true,
        purchasePrice: item.cost_per_unit,
        salePrice: item.sale_price_per_unit,
      })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'فشل إضافة المنتج للأستاذ' }, { status: 502 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('fabric_inventory')
      .update({ alostaz_product_id: productId })
      .eq('id', item.id)

    if (updateError) {
      return NextResponse.json(
        {
          data: { product_id: productId },
          warning: 'أُنشئ المنتج في الأستاذ لكن تعذّر حفظ المرجع محلياً: ' + updateError.message,
          error: null,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({ data: { product_id: productId }, error: null })
  } catch (error: any) {
    console.error('❌ sync-fabric-product error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ غير متوقع' }, { status: 500 })
  }
}
