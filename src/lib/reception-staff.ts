/**
 * موظفات الاستقبال — يُختار منهن من أخذ طلب التعديل (alterations.taken_by)
 * ومن أخذ المقاس (orders.measurement_taken_by).
 *
 * العمودان نصّيان بلا قيد، فإضافة اسم جديد تكون بإضافته هنا فقط بلا migration.
 */
export const RECEPTION_STAFF: ReadonlyArray<string> = ['هبة', 'منال', 'ندى']
