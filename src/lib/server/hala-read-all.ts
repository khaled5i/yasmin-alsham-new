/** Read every result page, including when PostgREST caps responses below 1000. */
export async function readAll<T extends { id: string }>(page: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [], ids = new Set<string>()
  for (let from = 0; from < 20000;) {
    const { data, error } = await page(from, from + 999)
    if (error || !data) throw new Error('تعذر قراءة جميع سجلات الموقع. أعد المحاولة.')
    for (const row of data) {
      if (ids.has(row.id)) throw new Error('تغيرت السجلات أثناء القراءة؛ أعد المقارنة.')
      ids.add(row.id); result.push(row)
    }
    if (!data.length) return result
    from += data.length
  }
  throw new Error('الفترة تحتوي على سجلات كثيرة؛ اختر فترة أقصر.')
}
