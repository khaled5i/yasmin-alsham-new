/**
 * البائعون في قسم الأقمشة — اختيار إجباري عند تسجيل مبيعة.
 *
 * يُخزَّن الاسم كما هو في income.seller_name (عمود نصّي بلا قيد)، فإضافة بائع
 * جديد تكون بإضافة اسمه هنا فقط بلا migration.
 */
export const FABRIC_SELLERS: ReadonlyArray<string> = ['عدنان', 'مهيب']
