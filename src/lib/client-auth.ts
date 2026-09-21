/**
 * ترويسة التفويض لاستدعاءات مسارات API من المتصفح.
 *
 * تُرجع كائناً فارغاً إن لم توجد جلسة — فيفشل الطلب بـ401 بدل أن يمرّ
 * بلا هوية. هذا سلوك مقصود: الفشل مغلق.
 */

import { supabase } from '@/lib/supabase'

export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch (error) {
    console.error('getAuthHeader failed:', error)
    return {}
  }
}
