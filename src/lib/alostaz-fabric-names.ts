/** اسم الصنف المرسل للأستاذ؛ لا يغيّر اسم المخزون المحلي أو الفواتير المحفوظة. */
export function normalizeAlostazFabricName(value: string | null | undefined): string {
  const name = String(value || '').trim()
  const length = Array.from(name).length
  if (length > 1000) {
    throw new Error('اسم بند القماش يتجاوز الحد المسموح للفاتورة الإلكترونية (1000 حرف)')
  }
  if (!name) return 'قماش'
  return length < 3 ? `قماش ${name}` : name
}
