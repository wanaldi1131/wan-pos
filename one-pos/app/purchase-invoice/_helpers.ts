import type { InvoiceItemRow } from './_types'

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtRp = (n: number) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID')

export const parseNum = (s: string) =>
  parseFloat(s.replace(/\./g, '').replace(/,/g, '')) || 0

export const fmtInput = (n: number): string =>
  n <= 0 ? '' : Math.round(n).toLocaleString('id-ID')

export function calcNetFactor(discStr: string): number {
  const parts = discStr.split('+').map(p => parseFloat(p.trim())).filter(n => !isNaN(n) && n > 0 && n < 100)
  return parts.reduce((acc, pct) => acc * (1 - pct / 100), 1)
}

export function calcDiscountAmount(subtotal: number, discStr: string, discType: 'percent' | 'amount'): number {
  const s = discStr.trim()
  if (!s) return 0
  if (discType === 'amount') return Math.min(parseNum(s), subtotal)
  return Math.round(subtotal * (1 - calcNetFactor(s)) * 100) / 100
}

export function backCalcUnitPrice(total: number, qty: number, discStr: string, discType: 'percent' | 'amount'): number {
  if (qty <= 0) return 0
  if (discType === 'amount') return (total + parseNum(discStr.trim())) / qty
  const f = calcNetFactor(discStr)
  return f > 0 ? total / (qty * f) : 0
}

export function recomputeTotal(row: InvoiceItemRow): string {
  if (!row.unitPriceStr.trim()) return ''
  const qty = parseNum(row.qtyStr)
  const sub = qty * parseNum(row.unitPriceStr)
  const disc = calcDiscountAmount(sub, row.discountStr, row.discountType)
  const tot = Math.max(0, sub - disc)
  return fmtInput(tot)
}

export function recomputePrice(totalStr: string, row: InvoiceItemRow): string {
  if (!totalStr.trim()) return ''
  const qty = parseNum(row.qtyStr)
  const price = backCalcUnitPrice(parseNum(totalStr), qty, row.discountStr, row.discountType)
  return fmtInput(price)
}

export function newEmptyRow(): InvoiceItemRow {
  return {
    rowId: Math.random().toString(36).slice(2),
    fromGr: false,
    productId: null, productName: '', unitId: null, unitName: '', unitOptions: [],
    qtyStr: '1',
    unitPriceStr: '', discountStr: '', discountType: 'percent', totalStr: '',
    search: '', hits: [], dropOpen: false,
  }
}
