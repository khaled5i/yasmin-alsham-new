import {
  buildTailoringReceiptHtml,
  type TailoringReceiptPayload,
} from '@/lib/print-tailoring-receipt'
import {
  getDirectPrinterConfig,
  prepareDirectPrinterConnection,
  printTailoringReceiptDirect,
  type TailoringDirectPrintOptions,
} from './direct-thermal-printer'
import { queueTailoringReceiptPrint } from './print-job-service'

export type TailoringPrintDestination = 'direct' | 'browser' | 'station'

export interface TailoringPrintDispatchResult {
  destination: TailoringPrintDestination
  directError?: string
}

function isAndroidClient(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

function printTailoringReceiptViaBrowser(payload: TailoringReceiptPayload): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('طباعة المتصفح غير متاحة على هذا الجهاز.'))
      return
    }

    let settled = false
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:0',
      'width:80mm',
      'height:297mm',
      'border:0',
      'background:#fff',
    ].join(';')

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 1500)
    }
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      cleanup()
      if (error) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve()
    }
    const timeout = window.setTimeout(
      () => finish(new Error('انتهت مهلة فتح نافذة طباعة الإيصال.')),
      12_000
    )

    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          const frameWindow = iframe.contentWindow
          if (!frameWindow) throw new Error('تعذّر الوصول إلى نافذة طباعة الإيصال.')
          frameWindow.focus()
          frameWindow.print()
          finish()
        } catch (error) {
          finish(error)
        }
      }, 250)
    }

    iframe.srcdoc = buildTailoringReceiptHtml(payload)
    document.body.appendChild(iframe)
  })
}

/**
 * يبدأ فحص جسر أندرويد فور ضغط زر التسليم وقبل انتظار قاعدة البيانات.
 * لا يرمي خطأً كي لا يمنع فشل الطابعة عملية تسليم الطلب نفسها.
 */
export function prepareTailoringReceiptPrint(): Promise<void> {
  if (!isAndroidClient()) return Promise.resolve()
  return prepareDirectPrinterConnection().catch((error) => {
    console.warn('[tailoring-printer] bridge warm-up failed', error)
  })
}

/**
 * على أندرويد يطبع عبر الجسر الخام، وعلى الكمبيوتر عبر تعريف طابعة المتصفح.
 * عند عدم الربط أو فشل الشبكة يبقى طابور المحطة احتياطياً حتى لا يضيع الإيصال.
 */
export async function dispatchTailoringReceiptPrint(
  payload: TailoringReceiptPayload,
  options: TailoringDirectPrintOptions = {}
): Promise<TailoringPrintDispatchResult> {
  if (!isAndroidClient() && typeof window !== 'undefined') {
    try {
      await printTailoringReceiptViaBrowser(payload)
      return { destination: 'browser' }
    } catch (error) {
      const directError = error instanceof Error ? error.message : String(error || '')
      await queueTailoringReceiptPrint(payload)
      return { destination: 'station', directError }
    }
  }

  const config = getDirectPrinterConfig()
  if (config.enabled) {
    try {
      await printTailoringReceiptDirect(payload, options)
      return { destination: 'direct' }
    } catch (error) {
      const directError = error instanceof Error ? error.message : String(error || '')
      // الانقطاع المؤقت لا يلغي إعداد الطابعة المحفوظ. نرسل الإيصال إلى
      // المحطة الاحتياطية الآن، ثم نحاول الاتصال المباشر مجدداً في الطباعة التالية.
      await queueTailoringReceiptPrint(payload)
      return { destination: 'station', directError }
    }
  }

  await queueTailoringReceiptPrint(payload)
  return { destination: 'station' }
}
