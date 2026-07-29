import {
  getDirectPrinterConfig,
  openCashDrawerDirect,
  prepareDirectPrinterConnection,
} from './direct-thermal-printer'

export interface CashDrawerWithdrawalVoucher {
  withdrawalId: string
  amount: number
  reason: string
  withdrawnAt: string
  withdrawnBy: string
}

export type CashDrawerOpenDestination = 'direct' | 'browser'

function isAndroidClient(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * يبدأ اتصال جسر الطابعة أثناء ضغطة المستخدم، قبل انتظار حفظ قاعدة البيانات.
 * الفشل هنا لا يمنع تسجيل السحب؛ ستظهر للمستخدم إمكانية إعادة فتح الدرج.
 */
export function prepareCashDrawerOpen(): Promise<void> {
  if (!isAndroidClient()) return Promise.resolve()
  if (!getDirectPrinterConfig().enabled) return Promise.resolve()
  return prepareDirectPrinterConnection()
}

function printWithdrawalVoucher(voucher: CashDrawerWithdrawalVoucher): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('فتح الدرج عبر طابعة الكمبيوتر غير متاح على هذا الجهاز.'))
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
      'height:120mm',
      'border:0',
      'background:#fff',
    ].join(';')

    const cleanup = () => window.setTimeout(() => iframe.remove(), 1500)
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      cleanup()
      if (error) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve()
    }
    const timeout = window.setTimeout(
      () => finish(new Error('انتهت مهلة إرسال أمر فتح الدرج إلى الطابعة.')),
      12_000
    )

    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          const frameWindow = iframe.contentWindow
          if (!frameWindow) throw new Error('تعذّر الوصول إلى طابعة الكمبيوتر.')
          frameWindow.focus()
          frameWindow.print()
          finish()
        } catch (error) {
          finish(error)
        }
      }, 250)
    }

    const withdrawnAt = new Date(voucher.withdrawnAt).toLocaleString(
      'ar-SA-u-nu-latn',
      { dateStyle: 'medium', timeStyle: 'short' }
    )

    iframe.srcdoc = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سند سحب من الصندوق</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      width: 72mm;
      margin: 0 auto;
      padding: 7mm 2mm 12mm;
      color: #111;
      background: #fff;
      font-family: Tahoma, "Segoe UI", sans-serif;
      text-align: right;
    }
    h1 { margin: 0; font-size: 21px; text-align: center; }
    h2 { margin: 2mm 0 5mm; font-size: 17px; text-align: center; }
    .amount { margin: 4mm 0; font-size: 25px; font-weight: 900; text-align: center; }
    .row { margin: 2mm 0; font-size: 13px; font-weight: 700; line-height: 1.7; }
    .rule { margin: 4mm 0; border: 0; border-top: 2px dashed #111; }
    .id { direction: ltr; font-family: monospace; font-size: 10px; text-align: center; }
  </style>
</head>
<body>
  <h1>ياسمين الشام</h1>
  <h2>سند سحب من الصندوق</h2>
  <hr class="rule">
  <div class="amount">${escapeHtml(formatCurrency(voucher.amount))}</div>
  <div class="row">السبب: ${escapeHtml(voucher.reason)}</div>
  <div class="row">بواسطة: ${escapeHtml(voucher.withdrawnBy)}</div>
  <div class="row">التاريخ: ${escapeHtml(withdrawnAt)}</div>
  <hr class="rule">
  <div class="id">${escapeHtml(voucher.withdrawalId)}</div>
</body>
</html>`

    document.body.appendChild(iframe)
  })
}

/**
 * أندرويد: نبضة ESC/POS مباشرة بلا ورق.
 * الكمبيوتر: طباعة سند سحب صغير؛ تعريف الطابعة يفتح الدرج عند بدء الطباعة.
 */
export async function dispatchCashDrawerOpen(
  voucher: CashDrawerWithdrawalVoucher,
  preparation?: Promise<void>
): Promise<CashDrawerOpenDestination> {
  if (isAndroidClient()) {
    if (!getDirectPrinterConfig().enabled) {
      throw new Error('اربط طابعة التفصيل من إعدادات الطابعة أولًا ثم أعد فتح الدرج.')
    }
    if (preparation) await preparation
    await openCashDrawerDirect()
    return 'direct'
  }

  await printWithdrawalVoucher(voucher)
  return 'browser'
}
