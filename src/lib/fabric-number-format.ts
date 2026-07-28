const FABRIC_DECIMAL_PLACES = 2
const FABRIC_DECIMAL_SCALE = 10 ** FABRIC_DECIMAL_PLACES

const fabricNumberFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  minimumFractionDigits: 0,
  maximumFractionDigits: FABRIC_DECIMAL_PLACES,
})

const fabricCurrencyFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  minimumFractionDigits: FABRIC_DECIMAL_PLACES,
  maximumFractionDigits: FABRIC_DECIMAL_PLACES,
})

export function roundFabricNumber(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * FABRIC_DECIMAL_SCALE) / FABRIC_DECIMAL_SCALE
}

export function formatFabricNumber(value: number | null | undefined): string {
  return fabricNumberFormatter.format(Number(value) || 0)
}

export function formatFabricCurrency(value: number | null | undefined): string {
  return `${fabricCurrencyFormatter.format(Number(value) || 0)} ر.س`
}
