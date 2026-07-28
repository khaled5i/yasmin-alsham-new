import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'
import {
  getDirectPrinterConfig,
  printTailoringReceiptDirect,
  type TailoringDirectPrintOptions,
} from './direct-thermal-printer'
import { queueTailoringReceiptPrint } from './print-job-service'

export type TailoringPrintDestination = 'direct' | 'station'

export interface TailoringPrintDispatchResult {
  destination: TailoringPrintDestination
  directError?: string
}

/**
 * يطبع مباشرة من Chrome/PWA عندما يكون الجهاز مربوطاً بالطابعة.
 * عند عدم الربط أو فشل الشبكة يبقى طابور المحطة احتياطياً حتى لا يضيع الإيصال.
 */
export async function dispatchTailoringReceiptPrint(
  payload: TailoringReceiptPayload,
  options: TailoringDirectPrintOptions = {}
): Promise<TailoringPrintDispatchResult> {
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
