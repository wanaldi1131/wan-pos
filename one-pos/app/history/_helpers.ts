import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sale, Filter, PayFilter } from './_types'

export const PAGE_SIZE = 30

export const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

export const fmtQty = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('id-ID', { maximumFractionDigits: 4 })

export const PAY_LABEL: Record<string, string> = {
  tunai: 'Tunai', transfer: 'Transfer', cod: 'COD', kredit: 'Kredit',
}

export async function enrichSales(sb: SupabaseClient, rows: any[]): Promise<Sale[]> {
  if (rows.length === 0) return []
  const cashierIds = [...new Set(rows.map((s: any) => s.cashier_id))]
  const custIds    = rows.filter((s: any) => s.customer_id).map((s: any) => s.customer_id as number)

  const [{ data: profiles }, { data: customers }] = await Promise.all([
    sb.from('profiles').select('id, full_name').in('id', cashierIds),
    custIds.length > 0
      ? sb.from('customers').select('id, name').in('id', custIds)
      : Promise.resolve({ data: [] }),
  ])

  return rows.map((s: any) => ({
    ...s,
    kasir_name:    (profiles ?? []).find((p: any) => p.id === s.cashier_id)?.full_name ?? '—',
    customer_name: (customers ?? []).find((c: any) => String(c.id) === String(s.customer_id))?.name,
  }))
}

export function buildQuery(sb: SupabaseClient, filter: Filter, payFilter: PayFilter) {
  let q = sb
    .from('sales')
    .select('id, code, cashier_id, customer_id, fulfillment, pay_method, pay_status, total, created_at')
    .order('created_at', { ascending: false })

  if (filter === 'today') {
    const d     = new Date()
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
    q = q.gte('created_at', start).lt('created_at', end)
  } else if (filter === 'week') {
    q = q.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  }

  if (payFilter !== 'all') q = q.eq('pay_status', payFilter)
  return q
}
