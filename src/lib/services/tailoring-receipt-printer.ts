import type { TailoringReceiptPayload } from '@/lib/print-tailoring-receipt'
import {
  DirectPrinterError,
  getDirectPrinterConfig,
  printTailoringReceiptDirect,
  saveDirectPrinterConfig,
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
      if (
        error instanceof DirectPrinterError &&
        (error.code === 'bridge-unavailable' || error.code === 'connection-failed')
      ) {
        try {
          saveDirectPrinterConfig({ enabled: false })
        } catch {
          // لا نسمح لفشل حفظ الحالة المحلية بمنع إرسال الإيصال إلى المحطة الاحتياطية.
        }
      }
      await queueTailoringReceiptPrint(payload)
      return { destination: 'station', directError }
    }
  }

  await queueTailoringReceiptPrint(payload)
  return { destination: 'station' }
}
