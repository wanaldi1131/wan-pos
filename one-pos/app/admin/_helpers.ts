export const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })

export const fmtQty = (n: number) =>
  Number.isInteger(Number(n))
    ? String(Number(n))
    : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 })

export const PAY_LABEL: Record<string, string> = {
  tunai: 'Tunai', transfer: 'Transfer', cod: 'COD', kredit: 'Kredit',
}
