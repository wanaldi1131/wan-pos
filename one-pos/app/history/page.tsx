'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

type Sale = {
  id: number
  code: string
  cashier_id: string
  customer_id: number | null
  fulfillment: 'ambil' | 'antar'
  pay_method: string
  pay_status: string
  total: number
  created_at: string
  kasir_name?: string
  customer_name?: string
}

type SaleItem = {
  id: number
  product_name: string
  unit_name: string
  qty: number
  unit_price: number
  subtotal: number
}

type Filter     = 'today' | 'week' | 'all'
type PayFilter  = 'all' | 'lunas' | 'belum'

const PAGE_SIZE = 30

const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

const PAY_LABEL: Record<string, string> = {
  tunai: 'Tunai', transfer: 'Transfer', cod: 'COD', kredit: 'Kredit',
}

async function enrichSales(sb: SupabaseClient, rows: any[]): Promise<Sale[]> {
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

function buildQuery(sb: SupabaseClient, filter: Filter, payFilter: PayFilter) {
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

export default function HistoryPage() {
  const [user, setUser]       = useState<User | null | undefined>(undefined)
  const [sales, setSales]     = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<Filter>('today')
  const [payFilter, setPayFilter] = useState<PayFilter>('all')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [search, setSearch]               = useState('')
  const [searchResults, setSearchResults] = useState<Sale[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)

  const [expandedId, setExpandedId]     = useState<number | null>(null)
  const [itemsCache, setItemsCache]     = useState<Record<number, SaleItem[]>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [])

  useEffect(() => {
    if (user === null) window.location.href = '/'
  }, [user])

  // Initial load — reset list when filter changes
  useEffect(() => {
    if (!user) return
    setLoading(true)
    setHasMore(false)
    setSales([])

    const load = async () => {
      const sb = createClient()
      const { data: rows, error } = await buildQuery(sb, filter, payFilter).range(0, PAGE_SIZE - 1)
      if (error || !rows) { console.error(error?.message); setLoading(false); return }

      const enriched = await enrichSales(sb, rows)
      setSales(enriched)
      setHasMore(rows.length === PAGE_SIZE)
      setExpandedId(null)
      setLoading(false)
    }
    load()
  }, [user, filter, payFilter])

  // Load more — append to existing list
  async function loadMore() {
    if (loadingMore) return
    setLoadingMore(true)
    const sb     = createClient()
    const offset = sales.length
    const { data: rows, error } = await buildQuery(sb, filter, payFilter).range(offset, offset + PAGE_SIZE - 1)
    if (error || !rows) { setLoadingMore(false); return }

    const enriched = await enrichSales(sb, rows)
    setSales(prev => [...prev, ...enriched])
    setHasMore(rows.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  // Server-side search: debounce 400ms, query by code + customer name
  useEffect(() => {
    const trimmed = search.trim()
    if (!trimmed || !user) {
      setSearchResults(null)
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    const t = setTimeout(async () => {
      const sb   = createClient()
      const term = `%${trimmed}%`

      const [{ data: byCode }, { data: matchCusts }] = await Promise.all([
        sb.from('sales')
          .select('id, code, cashier_id, customer_id, fulfillment, pay_method, pay_status, total, created_at')
          .ilike('code', term)
          .order('created_at', { ascending: false })
          .limit(50),
        sb.from('customers').select('id').ilike('name', term),
      ])

      const custIds = (matchCusts ?? []).map((c: any) => c.id)
      const { data: byCust } = custIds.length > 0
        ? await sb.from('sales')
            .select('id, code, cashier_id, customer_id, fulfillment, pay_method, pay_status, total, created_at')
            .in('customer_id', custIds)
            .order('created_at', { ascending: false })
            .limit(50)
        : { data: [] }

      const merged = [...(byCode ?? []), ...(byCust ?? [])]
      const unique = merged.filter((s, i) => merged.findIndex(r => r.id === s.id) === i)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      const enriched = await enrichSales(sb, unique)
      setSearchResults(enriched)
      setSearchLoading(false)
    }, 400)

    return () => clearTimeout(t)
  }, [search, user])

  // Auto-load more when sentinel comes into view
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, sales.length, filter])

  async function toggleDetail(saleId: number) {
    if (expandedId === saleId) { setExpandedId(null); return }

    setExpandedId(saleId)
    if (itemsCache[saleId]) return

    setLoadingItems(true)
    const sb = createClient()

    const { data: items } = await sb
      .from('sale_items')
      .select('id, product_id, unit_id, qty, unit_price, subtotal')
      .eq('sale_id', saleId)

    if (!items || items.length === 0) {
      setItemsCache(c => ({ ...c, [saleId]: [] }))
      setLoadingItems(false)
      return
    }

    const prodIds = [...new Set(items.map((i: any) => i.product_id))]
    const unitIds = [...new Set(items.map((i: any) => i.unit_id))]

    const [{ data: prods }, { data: units }] = await Promise.all([
      sb.from('products').select('id, name').in('id', prodIds),
      sb.from('product_units').select('id, unit_name').in('id', unitIds),
    ])

    setItemsCache(c => ({
      ...c,
      [saleId]: items.map((i: any) => ({
        id:           i.id,
        product_name: prods?.find((p: any) => String(p.id) === String(i.product_id))?.name ?? '—',
        unit_name:    units?.find((u: any) => String(u.id) === String(i.unit_id))?.unit_name ?? '—',
        qty:          i.qty,
        unit_price:   i.unit_price,
        subtotal:     i.subtotal,
      })),
    }))
    setLoadingItems(false)
  }

  if (user === undefined || user === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Memuat...</p>
      </div>
    )
  }

  const trimmed    = search.trim()
  const displayed  = trimmed ? (searchResults ?? []) : sales
  const grandTotal = displayed.reduce((s, i) => s + i.total, 0)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col select-none">

      {/* Top bar */}
      <div className="flex items-center px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0 gap-4">
        <a href="/" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">
          ← POS
        </a>
        <span className="text-white font-bold text-base flex-1">Riwayat Transaksi</span>
      </div>

      {/* Filter + ringkasan */}
      <div className="flex flex-col gap-2 px-4 py-3 bg-gray-900/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSearch('') }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/8 text-gray-400 hover:bg-white/15'
              }`}
            >
              {f === 'today' ? 'Hari Ini' : f === 'week' ? '7 Hari' : 'Semua'}
            </button>
          ))}
          {!loading && displayed.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-gray-500 text-sm">{displayed.length}{hasMore && !trimmed ? '+' : ''} transaksi</span>
              <span className="text-white font-bold text-base">{rp(grandTotal)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {([['all', 'Semua'], ['lunas', 'Lunas'], ['belum', 'Belum Lunas']] as [PayFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPayFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                payFilter === val
                  ? val === 'lunas'   ? 'bg-green-600/30 text-green-300 ring-1 ring-green-500/50'
                  : val === 'belum'   ? 'bg-amber-600/30 text-amber-300 ring-1 ring-amber-500/50'
                  :                     'bg-white/15 text-white'
                  : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-2">
          <input
            className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Cari nomor invoice atau nama pelanggan..."
            value={search}
            onChange={e => { setSearch(e.target.value); setExpandedId(null) }}
          />

          {loading ? (
            <p className="text-gray-500 text-center mt-12 text-sm">Memuat...</p>
          ) : searchLoading ? (
            <div className="text-center mt-12 space-y-2">
              <p className="text-gray-500 text-sm">Mencari di semua data...</p>
              <p className="text-gray-700 text-xs">Mungkin perlu beberapa detik</p>
            </div>
          ) : displayed.length === 0 ? (
            <p className="text-gray-600 text-center mt-12 text-sm">
              {trimmed ? `Tidak ditemukan: "${search}"` : 'Belum ada transaksi'}
            </p>
          ) : (
            <>
              {displayed.map(sale => {
                const isOpen = expandedId === sale.id
                const items  = itemsCache[sale.id]

                return (
                  <div
                    key={sale.id}
                    className={`border rounded-2xl transition-colors ${
                      isOpen
                        ? 'bg-gray-900 border-indigo-500/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <button
                      className="w-full text-left p-4"
                      onClick={() => toggleDetail(sale.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-white font-mono text-sm font-bold">{sale.code}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                              sale.pay_status === 'lunas'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}>{sale.pay_status}</span>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/10 text-gray-400">
                              {PAY_LABEL[sale.pay_method] ?? sale.pay_method}
                            </span>
                            {sale.fulfillment === 'antar' && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">
                                Antar
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 text-xs flex-wrap">
                            <span>
                              {new Date(sale.created_at).toLocaleString('id-ID', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            <span>·</span>
                            <span>{sale.kasir_name}</span>
                            {sale.customer_name && (
                              <><span>·</span><span>{sale.customer_name}</span></>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-white font-bold text-base">{rp(sale.total)}</span>
                          <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/10 px-4 pb-4">
                        {loadingItems && !items ? (
                          <p className="text-gray-500 text-xs text-center py-3">Memuat item...</p>
                        ) : !items || items.length === 0 ? (
                          <p className="text-gray-600 text-xs text-center py-3">Tidak ada item</p>
                        ) : (
                          <table className="w-full mt-3 text-sm">
                            <thead>
                              <tr className="text-gray-600 text-xs uppercase tracking-wide">
                                <th className="text-left pb-2 font-medium">Produk</th>
                                <th className="text-right pb-2 font-medium">Qty</th>
                                <th className="text-right pb-2 font-medium">Harga</th>
                                <th className="text-right pb-2 font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {items.map(item => (
                                <tr key={item.id}>
                                  <td className="py-2 text-white pr-3">{item.product_name}</td>
                                  <td className="py-2 text-gray-400 text-right whitespace-nowrap">
                                    {item.qty} {item.unit_name}
                                  </td>
                                  <td className="py-2 text-gray-400 text-right whitespace-nowrap">
                                    {rp(item.unit_price)}
                                  </td>
                                  <td className="py-2 text-indigo-300 font-semibold text-right whitespace-nowrap">
                                    {rp(item.subtotal)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/10">
                                <td colSpan={3} className="pt-3 text-gray-500 text-xs">Total</td>
                                <td className="pt-3 text-white font-bold text-right">{rp(sale.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Sentinel untuk infinite scroll */}
              {!trimmed && (
                <div ref={sentinelRef} className="py-4 text-center">
                  {loadingMore && <p className="text-gray-600 text-xs">Memuat...</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
