export default function OrderTakerLabel({ name, compact = false, isArabic = true }: {
  name?: string | null
  compact?: boolean
  isArabic?: boolean
}) {
  if (!name?.trim()) return null

  const label = isArabic ? 'استلم الطلب' : 'Received by'
  return (
    <span className={compact ? "min-w-0 truncate border-s border-slate-300 ps-1 font-medium text-slate-600" : "block min-w-0 truncate text-xs font-medium text-slate-600"} title={`${label}: ${name}`}>
      <span className={compact ? 'sr-only' : undefined}>{label}: </span><bdi>{name}</bdi>
    </span>
  )
}
