import type { TextItem } from 'pdfjs-dist/types/src/display/api'

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfModule: Promise<PdfJs> | undefined

function loadPdfJs(): Promise<PdfJs> {
  // PDF.js must run as a native module: Webpack's eval development wrapper breaks its exports.
  // Keep this file and the worker pinned to the same installed PDF.js version.
  if (!pdfModule) {
    const moduleUrl = '/pdf/hala-pdf-5.4.624.min.mjs'
    pdfModule = (import(/* webpackIgnore: true */ moduleUrl) as Promise<PdfJs>)
      .catch(error => { pdfModule = undefined; throw error })
  }
  return pdfModule
}

/** PDF is read on this device. Only extracted text is sent to the authenticated comparison API. */
export async function readHalaPdf(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('حجم الملف يجب ألا يتجاوز 10 ميغابايت.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('اختر ملف PDF صالحاً.')
  const pdfjs = await loadPdfJs()
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/hala-pdf.worker-5.4.624.min.mjs'
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 100) throw new Error('الملف يتجاوز 100 صفحة؛ صدّر فترة أقصر من هلا.')
    let text = ''
    for (let n=1; n<=pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      // Recover rows by y coordinate and x position, independently of PDF item insertion order.
      const lines: Array<{ y:number; items:TextItem[] }> = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const y = item.transform[5]
        let line = lines.find(l=>Math.abs(l.y-y)<2)
        if (!line) { line={y,items:[]};lines.push(line) }
        line.items.push(item)
      }
      text += lines.sort((a,b)=>b.y-a.y).map(l=>l.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ')).join('\n')+'\n'
      if (text.length>2000000) throw new Error('محتوى الملف أكبر من الحد المسموح.')
      page.cleanup()
    }
    return text
  } finally { await task.destroy() }
}
