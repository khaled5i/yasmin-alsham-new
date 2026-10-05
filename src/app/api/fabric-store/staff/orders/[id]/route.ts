import { NextRequest } from 'next/server'
import { z } from 'zod'
import { deriveAccessToken, errorResponse, jsonResponse } from '@/lib/server/fabric-store/http'
import { isRefundsServerEnabled, requireFabricStoreStaff } from '@/lib/server/fabric-store/staff-auth'
import { getPaymentDeps } from '@/lib/server/fabric-store/payment-context'
import { closeUnconfirmedRefund, startRefund } from '@/lib/server/fabric-store/refunds'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * تفاصيل طلب واحد وإجراءات الموظف عليه (المرحلة 7) — للمدير ومدير متجر الأقمشة.
 * GET: الطلب وأسطره وعنوانه ومحاولات الدفع والمبيعة ومهام الطابور وسجل التدقيق،
 *      ورابط تتبّع الزبونة (يُشتق من مفتاح الطلب والسر، ولا يُخزَّن).
 * POST: { action: 'fulfillment' | 'resolve_review' | 'note', ... } ⇒ دوال القاعدة باسم الموظف.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFabricStoreStaff(request)
  if (!auth.ok) return auth.response
  const { client } = auth.staff
  const { id } = await params
  if (!UUID.test(id)) return errorResponse(400, 'bad-request', 'طلب غير صالح')

  const { data: order, error } = await client
    .from('fabric_store_orders')
    .select(`id, order_number, checkout_key, created_at, paid_at, customer_name, customer_phone, customer_email,
      delivery_method, delivery_option_label, items_net_halalas, shipping_net_halalas, shipping_vat_halalas,
      vat_halalas, total_halalas, payment_status, fulfillment_status, payment_due_at, paid_attempt_id, income_id,
      needs_review, review_reason, cancel_reason, cancelled_at, delivered_at, shipping_carrier, tracking_number,
      shipped_at, access_expires_at, marketing_opt_in, cut_started_at`)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('fabric-store staff order failed:', error.message)
    return errorResponse(503, 'unavailable', 'تعذّر تحميل الطلب')
  }
  if (!order) return errorResponse(404, 'not-found', 'الطلب غير موجود')

  const [items, address, attempts, tasks, events, sale, refunds, restocks] = await Promise.all([
    client.from('fabric_store_order_items')
      .select('line_number, fabric_name, fabric_code, color_name, image_url, purchase_mode, piece_length_cm, quantity_cm, stock_consumption_cm, gross_halalas')
      .eq('order_id', id).order('line_number'),
    order.delivery_method === 'shipping'
      ? client.from('fabric_store_order_addresses')
        .select('recipient_name, recipient_phone, city, district, street, building_number, postal_code, additional_number, short_address, notes, anonymized_at')
        .eq('order_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
    client.from('fabric_store_payment_attempts')
      .select('id, environment, status, amount_halalas, provider_invoice_id, provider_payment_id, failure_code, created_at')
      .eq('order_id', id).order('created_at'),
    client.from('fabric_store_outbox')
      .select('id, topic, status, attempts, max_attempts, last_error, payload, created_at, completed_at')
      .eq('order_id', id).order('created_at'),
    client.from('fabric_store_order_events')
      .select('id, event_type, from_value, to_value, actor_type, actor_id, note, created_at')
      .eq('order_id', id).order('id'),
    order.income_id
      ? client.from('income')
        .select('invoice_number, date, amount, alostaz_sync_status, alostaz_invoice_code, alostaz_sync_error')
        .eq('id', order.income_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // المرحلة 8 (قبل تطبيق هجرتها لا توجد هذه الأعمدة ولا الجدول: يُعرض الطلب بدونها)
    isRefundsServerEnabled()
      ? client.from('fabric_store_refunds')
        .select('id, amount_halalas, reason, status, cancels_order, failure_message, requested_by_label, created_at, completed_at, income_id, credit_note_code, credit_note_at, provider_called_at, review_reference, review_note, reviewed_at')
        .eq('order_id', id).order('created_at')
      : Promise.resolve({ data: null, error: null }),
    isRefundsServerEnabled()
      ? client.from('fabric_store_restocks')
        .select('line_number, quantity_cm, reason, note, created_at')
        .eq('order_id', id).order('id')
      : Promise.resolve({ data: null, error: null }),
  ])

  if (items.error || attempts.error || tasks.error || events.error || refunds.error || restocks.error) {
    return errorResponse(503, 'unavailable', 'تعذّر تحميل تفاصيل الطلب كاملة — أعيدي المحاولة')
  }

  // أسماء الموظفين في السجل
  const actorIds = [...new Set((events.data ?? []).map(e => e.actor_id).filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (actorIds.length) {
    const { data: users } = await client.from('users').select('id, full_name').in('id', actorIds)
    for (const u of users ?? []) names.set(u.id, u.full_name ?? '')
  }

  const paidAttempt = (attempts.data ?? []).find(a => a.id === order.paid_attempt_id)
  const refundRows = (refunds.data ?? []) as Array<Record<string, unknown>>
  const refundedHalalas = refundRows.filter(r => r.status === 'succeeded').reduce((s, r) => s + Number(r.amount_halalas), 0)
  const saleInvoiceSent = !!(sale.data && (sale.data.alostaz_invoice_code || sale.data.alostaz_sync_status === 'sent'))
  const secret = process.env.FABRIC_STORE_ACCESS_SECRET ?? ''
  const accessOpen = Date.parse(order.access_expires_at) > Date.now()
  const trackingUrl = secret.length >= 32 && accessOpen
    ? `${request.nextUrl.origin}/fabrics/order/?t=${deriveAccessToken(secret, order.checkout_key)}`
    : null

  return jsonResponse({
    ok: true,
    order: {
      id: order.id,
      orderNumber: order.order_number,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      marketingOptIn: order.marketing_opt_in,
      deliveryMethod: order.delivery_method,
      deliveryLabel: order.delivery_option_label,
      itemsNetHalalas: Number(order.items_net_halalas),
      shippingHalalas: Number(order.shipping_net_halalas) + Number(order.shipping_vat_halalas),
      vatHalalas: Number(order.vat_halalas),
      totalHalalas: Number(order.total_halalas),
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      paymentDueAt: order.payment_due_at,
      needsReview: order.needs_review,
      reviewReason: order.review_reason,
      reviewSnapshot: {
        reason: order.review_reason,
        eventId: events.data?.length ? String(events.data[events.data.length - 1].id) : null,
        alertIds: (tasks.data ?? []).filter(t => t.topic === 'notify_staff' && t.status !== 'done')
          .map(t => t.id).sort(),
      },
      cancelReason: order.cancel_reason,
      cancelledAt: order.cancelled_at,
      deliveredAt: order.delivered_at,
      shippingCarrier: order.shipping_carrier,
      trackingNumber: order.tracking_number,
      shippedAt: order.shipped_at,
      // المرحلة 8 (مراجعة 2): واقعة بدء القص الدائمة
      cutStartedAt: order.cut_started_at ?? null,
      isTest: paidAttempt?.environment === 'test',
      saleRecorded: order.income_id != null,
      trackingUrl,
    },
    items: (items.data ?? []).map(item => ({
      lineNumber: item.line_number,
      name: item.fabric_name,
      code: item.fabric_code,
      color: item.color_name,
      imageUrl: item.image_url,
      purchaseMode: item.purchase_mode,
      pieceLengthCm: item.piece_length_cm,
      quantityCm: item.quantity_cm,
      consumptionCm: item.stock_consumption_cm,
      grossHalalas: Number(item.gross_halalas),
    })),
    address: address.data ?? null,
    attempts: (attempts.data ?? []).map(a => ({
      id: a.id, environment: a.environment, status: a.status, amountHalalas: Number(a.amount_halalas),
      invoiceId: a.provider_invoice_id, paymentId: a.provider_payment_id, failureCode: a.failure_code, createdAt: a.created_at,
    })),
    sale: sale.data
      ? {
          invoiceNumber: sale.data.invoice_number,
          date: sale.data.date,
          amount: Number(sale.data.amount),
          alostazStatus: sale.data.alostaz_sync_status,
          alostazCode: sale.data.alostaz_invoice_code,
          alostazError: sale.data.alostaz_sync_error,
        }
      : null,
    tasks: (tasks.data ?? []).map(t => ({
      id: t.id, topic: t.topic, status: t.status, attempts: t.attempts, maxAttempts: t.max_attempts,
      lastError: t.last_error,
      reason: (t.payload as Record<string, unknown> | null)?.reason ?? (t.payload as Record<string, unknown> | null)?.result ?? null,
      createdAt: t.created_at, completedAt: t.completed_at,
    })),
    events: (events.data ?? []).map(e => ({
      id: e.id, type: e.event_type, from: e.from_value, to: e.to_value, actorType: e.actor_type,
      actorName: e.actor_id ? names.get(e.actor_id) ?? null : null, note: e.note, createdAt: e.created_at,
    })),
    // المرحلة 8
    viewerRole: auth.staff.role,
    refundsEnabled: isRefundsServerEnabled(),
    refundableHalalas: paidAttempt && ['paid', 'partially_refunded'].includes(order.payment_status)
      ? Math.max(0, Number(paidAttempt.amount_halalas) - refundedHalalas) : 0,
    refunds: refundRows.map(r => ({
      id: String(r.id),
      amountHalalas: Number(r.amount_halalas),
      reason: r.reason as string,
      status: r.status as string,
      cancelsOrder: !!r.cancels_order,
      failureMessage: (r.failure_message as string | null) ?? null,
      requestedBy: (r.requested_by_label as string | null) ?? null,
      createdAt: r.created_at as string,
      completedAt: (r.completed_at as string | null) ?? null,
      hasIncomeRow: r.income_id != null,
      creditNoteCode: (r.credit_note_code as string | null) ?? null,
      // (مراجعة) نداء أُرسل لميسر ولم يظهر: قرار المدير بعد 24 ساعة، بمرجع التسوية
      providerCalledAt: (r.provider_called_at as string | null) ?? null,
      reviewReference: (r.review_reference as string | null) ?? null,
      reviewNote: (r.review_note as string | null) ?? null,
      reviewedAt: (r.reviewed_at as string | null) ?? null,
      // إشعار دائن مطلوب: مرتجع مسجّل في الواردات وفاتورة البيع وصلت الأستاذ، ولم يُسجَّل رقمه.
      creditNoteNeeded: r.status === 'succeeded' && r.income_id != null && !r.credit_note_code && saleInvoiceSent,
    })),
    restocks: ((restocks.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      lineNumber: Number(r.line_number), quantityCm: Number(r.quantity_cm), reason: r.reason as string,
      note: (r.note as string | null) ?? null, createdAt: r.created_at as string,
    })),
  })
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('fulfillment'),
    to: z.enum(['unfulfilled', 'preparing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled']),
    carrier: z.string().max(80).optional().nullable(),
    tracking: z.string().max(80).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  }),
  z.object({ action: z.literal('resolve_review'), note: z.string().max(500), reviewSnapshot: z.object({
    reason: z.string().nullable(), eventId: z.string().regex(/^\d+$/).nullable(),
    alertIds: z.array(z.string().uuid()).max(1000),
  }) }),
  z.object({ action: z.literal('note'), note: z.string().max(500) }),
  // المرحلة 8
  z.object({
    action: z.literal('refund'),
    amountHalalas: z.number().int().positive().max(100_000_000),
    reason: z.string().max(500),
    cancel: z.boolean(),
    key: z.string().uuid(),
  }),
  z.object({
    action: z.literal('restock'),
    lines: z.array(z.object({
      lineNumber: z.number().int().min(1).max(40),
      quantityCm: z.number().int().min(1).max(100_000),
    })).min(1).max(40),
    note: z.string().max(500),
    key: z.string().uuid(),
  }),
  z.object({ action: z.literal('credit_note'), refundId: z.string().uuid(), code: z.string().max(60) }),
  z.object({ action: z.literal('refund_close'), refundId: z.string().uuid(), reference: z.string().max(120), note: z.string().max(500) }),
])

const REFUND_STATUS_MESSAGES: Record<string, string> = {
  succeeded: 'تم الاسترداد',
  pending: 'أُرسل الاسترداد لميسر ولم يصل تأكيده بعد — تُطابقه المهمة المجدولة خلال دقائق، لا تعيدي المحاولة',
  failed: 'رفض ميسر الاسترداد — راجعي السبب في سجل الطلب',
  mismatch: 'ميسر يُظهر استرداداً لم نسجّله — لم يُرسل استرداد جديد، والطلب رُفع للمراجعة',
}

const STAGE8_MESSAGES: Record<string, [number, string]> = {
  already_done: [200, 'سُجّلت هذه الإعادة من قبل'],
  nothing_to_restock: [409, 'لم يُخصم قماش لهذا الطلب (دفعة اختبار أو مبيعة لم تُسجَّل)'],
  not_cut: [409, 'الطلب لم يُقص: الإلغاء قبل القص يعيد القماش آلياً'],
  exceeds: [400, 'الطول المُعاد أكبر مما خُصم لهذا السطر بعد الإعادات السابقة'],
  not_required: [409, 'لا حاجة لإشعار دائن لهذا الاسترداد (لا مرتجع في الواردات)'],
  already_recorded: [409, 'سُجّل رقم إشعار دائن آخر لهذا الاسترداد'],
}

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, 'الطلب غير موجود'],
  bad_request: [400, 'طلب غير صالح'],
  sale_pending: [409, 'مبيعة هذا الطلب لم تُسجَّل بعد في الواردات — انتظري دقائق ثم أعيدي المحاولة'],
  refund_required: [409, 'الطلب مدفوع: إلغاؤه يكون مع استرداد المبلغ (من المدير)'],
  tracking_required: [400, 'اكتبي اسم شركة الشحن ورقم البوليصة (حروف إنجليزية وأرقام)'],
  note_required: [400, 'اكتبي ملاحظة توضّح ما تم'],
  not_flagged: [409, 'الطلب ليس عليه علامة مراجعة'],
  review_changed: [409, 'وصل تحديث جديد للطلب — راجعي التنبيهات المحدّثة قبل حسم المراجعة'],
  refund_pending: [409, 'إلغاء الطلب واسترداده قيد التنفيذ — لا يبدأ التجهيز'],
}

const REFUSALS: Record<string, string> = {
  FABRIC_STORE_FULFILLMENT_UNPAID: 'لا يُجهَّز طلب لم يُدفع',
  FABRIC_STORE_FULFILLMENT_UNDER_REVIEW: 'الطلب تحت المراجعة: احسميها أولاً',
  FABRIC_STORE_FULFILLMENT_TRANSITION: 'لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية',
  FABRIC_STORE_FULFILLMENT_ACTOR: 'غير مسموح',
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFabricStoreStaff(request)
  if (!auth.ok) return auth.response
  const { client, userId } = auth.staff
  const { id } = await params
  if (!UUID.test(id)) return errorResponse(400, 'bad-request', 'طلب غير صالح')

  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse(400, 'bad-request', 'طلب غير صالح')
  const body = parsed.data

  if (body.action === 'refund' || body.action === 'restock' || body.action === 'credit_note' || body.action === 'refund_close') {
    if (!isRefundsServerEnabled()) return errorResponse(404, 'not-found', 'غير موجود')
    if (body.action === 'refund_close') {
      // قرار مالي: للمدير فقط، كالاسترداد نفسه
      if (auth.staff.role !== 'admin') return errorResponse(403, 'forbidden', 'للمدير فقط')
      const payment = getPaymentDeps()
      if (!payment.ok) return payment.response
      const { data: refundRow } = await client.from('fabric_store_refunds')
        .select('id, order_id, attempt_id, provider_called_at').eq('id', body.refundId).eq('order_id', id).maybeSingle()
      if (!refundRow) return errorResponse(404, 'not-found', 'الاسترداد غير موجود')
      const { data: attemptRow } = await client.from('fabric_store_payment_attempts')
        .select('provider_payment_id, environment').eq('id', refundRow.attempt_id).maybeSingle()
      const closed = await closeUnconfirmedRefund(payment.deps, {
        refundId: refundRow.id, paymentId: attemptRow?.provider_payment_id ?? null,
        environment: attemptRow?.environment ?? '', called: refundRow.provider_called_at != null,
        actorId: userId, reference: body.reference, note: body.note,
      })
      if (!closed.ok) return errorResponse(closed.httpStatus, closed.code, closed.error)
      return jsonResponse({ ok: true, result: { status: 'ok', message: 'أُغلق الاسترداد بقرارك ومرجع التسوية؛ يمكن الآن بدء استرداد جديد' } })
    }
    if (body.action === 'refund') {
      // قرار المالك (21 سبتمبر): الاسترداد للمدير فقط.
      if (auth.staff.role !== 'admin') return errorResponse(403, 'forbidden', 'الاسترداد للمدير فقط')
      const payment = getPaymentDeps()
      if (!payment.ok) return payment.response
      const { data: account } = await client.from('users').select('full_name').eq('id', userId).maybeSingle()
      const result = await startRefund(payment.deps, {
        orderId: id, actorId: userId, actorLabel: account?.full_name ?? null,
        amountHalalas: body.amountHalalas, reason: body.reason, cancel: body.cancel, key: body.key,
      })
      if (!result.ok) return errorResponse(result.httpStatus, result.code, result.error)
      if (result.status === 'failed' || result.status === 'mismatch') {
        return errorResponse(409, `refund-${result.status}`, REFUND_STATUS_MESSAGES[result.status])
      }
      return jsonResponse({ ok: true, result: {
        status: result.status, refundId: result.refundId, message: REFUND_STATUS_MESSAGES[result.status],
      } })
    }
    const { data, error } = body.action === 'restock'
      ? await client.rpc('fabric_store_restock_return', {
          p_order_id: id, p_actor_id: userId, p_note: body.note, p_key: body.key,
          p_lines: body.lines.map(l => ({ line_number: l.lineNumber, quantity_cm: l.quantityCm })),
        })
      : await client.rpc('fabric_store_record_credit_note', { p_refund_id: body.refundId, p_actor_id: userId, p_code: body.code })
    if (error) {
      console.error('fabric-store staff action failed:', body.action, error.message)
      return errorResponse(error.code === '55P03' ? 409 : 503, 'unavailable',
        error.code === '55P03' ? 'الطلب مشغول الآن — أعيدي المحاولة بعد لحظات' : 'تعذّر تنفيذ الإجراء')
    }
    const result = (data ?? {}) as { status?: string; message?: string }
    if (result.status === 'ok') return jsonResponse({ ok: true, result })
    if (result.status === 'already_done') return jsonResponse({ ok: true, result })
    const [httpStatus, message] = STAGE8_MESSAGES[result.status ?? ''] ?? MESSAGES[result.status ?? ''] ?? [400, 'تعذّر تنفيذ الإجراء']
    return errorResponse(httpStatus, result.status ?? 'error', result.status === 'exceeds' && result.message ? result.message : message)
  }

  const { data, error } = body.action === 'fulfillment'
    ? await client.rpc('fabric_store_staff_set_fulfillment', {
        p_order_id: id, p_to: body.to, p_actor_id: userId,
        p_carrier: body.carrier ?? null, p_tracking: body.tracking ?? null, p_note: body.note ?? null,
      })
    : body.action === 'resolve_review'
      ? await client.rpc('fabric_store_staff_resolve_review', {
          p_order_id: id, p_actor_id: userId, p_note: body.note, p_expected_review: body.reviewSnapshot,
        })
      : await client.rpc('fabric_store_staff_add_note', { p_order_id: id, p_actor_id: userId, p_note: body.note })

  if (error) {
    console.error('fabric-store staff action failed:', body.action, error.message)
    return errorResponse(error.code === '55P03' ? 409 : 503, 'unavailable',
      error.code === '55P03' ? 'الطلب مشغول الآن — أعيدي المحاولة بعد لحظات' : 'تعذّر تنفيذ الإجراء')
  }
  const result = (data ?? {}) as { status?: string; code?: string; message?: string }
  if (result.status === 'ok') return jsonResponse({ ok: true, result })
  if (result.status === 'refused') {
    return errorResponse(409, result.code ?? 'refused', REFUSALS[result.code ?? ''] ?? 'تعذّر تغيير الحالة')
  }
  const [httpStatus, message] = MESSAGES[result.status ?? ''] ?? [400, 'تعذّر تنفيذ الإجراء']
  return errorResponse(httpStatus, result.status ?? 'error', message)
}
