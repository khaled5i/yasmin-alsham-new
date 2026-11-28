/**
 * من أخذ الطلب — اختيار إجباري عند حفظ طلب تفصيل جديد.
 *
 * يُخزَّن الاسم كما هو في orders.taken_by (عمود نصّي بلا قيد)، فإضافة شخص
 * جديد تكون بإضافته هنا فقط بلا migration. خيار «شخص آخر» يكتب الاسم يدوياً.
 */
export interface OrderTakerOption {
  /** القيمة المحفوظة في orders.taken_by */
  value: string
  /** وصف صغير تحت الاسم (اختياري) */
  hint?: string
}

export const ORDER_TAKERS: ReadonlyArray<OrderTakerOption> = [
  { value: 'ابو خالد' },
  { value: 'وليد' },
  { value: 'عبدالرحمن', hint: 'المدير' },
]

export const ORDER_TAKER_MAX_LENGTH = 100
