/**
 * بعد كل نشر جديد تبقى عند بعض الزائرات صفحة من البناء القديم، فتطلب ملفات JS لم تعد موجودة
 * (ChunkLoadError / «could not find the module»). علاجها إعادة تحميل الصفحة مرة واحدة فقط —
 * العلم في sessionStorage يمنع حلقة إعادة تحميل إن كان الخطأ حقيقياً.
 */
const RELOAD_FLAG = 'ys-stale-build-reload'

export function isStaleBuildError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  return /ChunkLoadError|Loading (CSS )?chunk|could not find the module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)
}

/** يعيد true إن بدأ إعادة التحميل. */
export function reloadOnceForStaleBuild(error: unknown): boolean {
  if (typeof window === 'undefined' || !isStaleBuildError(error)) return false
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG)) return false
    window.sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    return false
  }
  window.location.reload()
  return true
}
