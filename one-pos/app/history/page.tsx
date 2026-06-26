'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Sale, SaleItem, Filter, PayFilter } from './_types'
import { PAGE_SIZE, rp, fmtQty, PAY_LABEL, enrichSales, buildQuery } from './_helpers'
import { ReturPanel } from './_components/ReturPanel'

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
  const [returnsCache, setReturnsCache] = useState<Record<number, number>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  const [returningId, setReturningId]   = useState<number | null>(null)
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null)

  // ── Auth ─────────────────────────────────────────────────────

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [])

  useEffect(() => {
    if (user === null) window.location.href = '/'
  }, [user])

  // ── Initial load ──────────────────────────────────────────────

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

  // ── Load more (infinite scroll) ───────────────────────────────

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

  // ── Server-side search ────────────────────────────────────────

  useEffect(() => {
    const trimmed = search.trim()
    if (!trimmed || !user) { setSearchResults(null); setSearchLoading(false); return }

    setSearchLoading(true)
    const t = setTimeout(async () => {
      const sb   = createClient()
      const term = `%${trimmed}%`

      const [{ data: byCode }, { data: matchCusts }] = await Promise.all([
        sb.from('sales')
          .select('id, code, cashier_id, customer_id, fulfillment, pay_method, pay_status, total, created_at')
          .ilike('code', term).order('created_at', { ascending: false }).limit(50),
        sb.from('customers').select('id').ilike('name', term),
      ])

      const custIds = (matchCusts ?? []).map((c: any) => c.id)
      const { data: byCust } = custIds.length > 0
        ? await sb.from('sales')
            .select('id, code, cashier_id, customer_id, fulfillment, pay_method, pay_status, total, created_at')
            .in('customer_id', custIds).order('created_at', { ascending: false }).limit(50)
        : { data: [] }

      const merged  = [...(byCode ?? []), ...(byCust ?? [])]
      const unique  = merged.filter((s, i) => merged.findIndex(r => r.id === s.id) === i)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setSearchResults(await enrichSales(sb, unique))
      setSearchLoading(false)
    }, 400)
    return () => clearTimeout(t)
  }, [search, user])

  // ── Toggle detail (expand) ────────────────────────────────────

  async function toggleDetail(saleId: number) {
    if (expandedId === saleId) {
      setExpandedId(null)
      setReturningId(null)
      return
    }

    setExpandedId(saleId)
    if (itemsCache[saleId]) return

    setLoadingItems(true)
    const sb = createClient()

    const [{ data: items }, { data: saleReturns }] = await Promise.all([
      sb.from('sale_items')
        .select('id, product_id, unit_id, qty, unit_price, subtotal')
        .eq('sale_id', saleId),
      sb.from('sale_returns')
        .select('total')
        .eq('sale_id', saleId),
    ])

    const totalReturned = (saleReturns ?? []).reduce((s, r) => s + Number(r.total), 0)
    setReturnsCache(c => ({ ...c, [saleId]: totalReturned }))

    if (!items || items.length === 0) {
      setItemsCache(c => ({ ...c, [saleId]: [] }))
      setLoadingItems(false)
      return
    }

    const prodIds = [...new Set(items.map((i: any) => i.product_id))]
    const unitIds = [...new Set(items.map((i: any) => i.unit_id))]

    const [{ data: prods }, { data: units }] = await Promise.all([
      sb.from('products').select('id, name').in('id', prodIds),
      sb.from('product_units').select('id, unit_name, factor_to_base').in('id', unitIds),
    ])

    setItemsCache(c => ({
      ...c,
      [saleId]: items.map((i: any) => ({
        id:             i.id,
        product_id:     i.product_id,
        unit_id:        i.unit_id,
        product_name:   prods?.find((p: any) => String(p.id) === String(i.product_id))?.name ?? '—',
        unit_name:      units?.find((u: any) => String(u.id) === String(i.unit_id))?.unit_name ?? '—',
        factor_to_base: units?.find((u: any) => String(u.id) === String(i.unit_id))?.factor_to_base ?? 1,
        qty:            i.qty,
        unit_price:     i.unit_price,
        subtotal:       i.subtotal,
      })),
    }))
    setLoadingItems(false)
  }

  function handleReturSuccess(saleId: number, total: number) {
    setReturningId(null)
    setReturnSuccess(`Retur ${rp(total)} berhasil dicatat`)
    setTimeout(() => setReturnSuccess(null), 4000)
    setItemsCache(c => { const copy = { ...c }; delete copy[saleId]; return copy })
    setReturnsCache(c => { const copy = { ...c }; delete copy[saleId]; return copy })
  }

  // ── Render guard ──────────────────────────────────────────────

  if (user === undefined || user === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Memuat...</p>
      </div>
    )
  }

  const trimmed    = search.trim()
  const displayed  = trimmed ? (searchResults ?? []) : sales
  const grandTotal = displayed.reduce((s, i) => s + i.total, 0)

  // ── UI ────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col select-none">

      {/* Filter + ringkasan */}
      <div className="flex flex-col gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {(['today', 'week', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSearch('') }}
              className={`px-4 py-2 rounded-xl text-base font-semibold transition-colors ${
                filter === f ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f === 'today' ? 'Hari Ini' : f === 'week' ? '7 Hari' : 'Semua'}
            </button>
          ))}
          {!loading && displayed.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-gray-500 text-base">{displayed.length}{hasMore && !trimmed ? '+' : ''} transaksi</span>
              <span className="text-gray-900 font-bold text-base">{rp(grandTotal)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {([['all', 'Semua'], ['lunas', 'Lunas'], ['belum', 'Belum Lunas']] as [PayFilter, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPayFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                payFilter === val
                  ? val === 'lunas' ? 'bg-green-100 text-green-700 ring-1 ring-green-400'
                  : val === 'belum' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-400'
                  :                   'bg-gray-200 text-gray-900'
                  : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700'
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
            className="w-full bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            placeholder="Cari nomor invoice atau nama pelanggan..."
            value={search}
            onChange={e => { setSearch(e.target.value); setExpandedId(null) }}
          />

          {loading ? (
            <p className="text-gray-500 text-center mt-12 text-base">Memuat...</p>
          ) : searchLoading ? (
            <div className="text-center mt-12 space-y-2">
              <p className="text-gray-500 text-base">Mencari di semua data...</p>
              <p className="text-gray-700 text-sm">Mungkin perlu beberapa detik</p>
            </div>
          ) : displayed.length === 0 ? (
            <p className="text-gray-500 text-center mt-12 text-base">
              {trimmed ? `Tidak ditemukan: "${search}"` : 'Belum ada transaksi'}
            </p>
          ) : (
            <>
              {displayed.map(sale => {
                const isOpen  = expandedId === sale.id
                const items   = itemsCache[sale.id]
                const isRetur = returningId === sale.id

                return (
                  <div
                    key={sale.id}
                    className={`border rounded-2xl transition-colors ${
                      isOpen
                        ? isRetur
                          ? 'bg-amber-50 border-amber-400'
                          : 'bg-orange-50 border-orange-300'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Header */}
                    <button className="w-full text-left p-4" onClick={() => toggleDetail(sale.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-gray-900 font-mono text-base font-bold">{sale.code}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                              sale.pay_status === 'lunas'
                                ? 'bg-green-500/20 text-green-600'
                                : 'bg-amber-500/20 text-amber-600'
                            }`}>{sale.pay_status}</span>
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/10 text-gray-500">
                              {PAY_LABEL[sale.pay_method] ?? sale.pay_method}
                            </span>
                            {sale.fulfillment === 'antar' && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">Antar</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-500 text-sm flex-wrap">
                            <span>
                              {new Date(sale.created_at).toLocaleString('id-ID', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            <span>·</span>
                            <span>{sale.kasir_name}</span>
                            {sale.customer_name && <><span>·</span><span>{sale.customer_name}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-gray-900 font-bold text-base">{rp(sale.total)}</span>
                          <span className="text-gray-500 text-sm">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {/* Detail / Retur panel */}
                    {isOpen && (
                      <div className="border-t border-gray-200 px-4 pb-4">

                        {returnSuccess && expandedId === sale.id && (
                          <div className="mt-3 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-600 text-base font-medium">
                            ✓ {returnSuccess}
                          </div>
                        )}

                        {loadingItems && !items ? (
                          <p className="text-gray-500 text-sm text-center py-3">Memuat item...</p>
                        ) : !items || items.length === 0 ? (
                          <p className="text-gray-500 text-sm text-center py-3">Tidak ada item</p>

                        ) : isRetur ? (
                          <ReturPanel
                            saleId={sale.id}
                            items={items}
                            userId={user.id}
                            onSuccess={(total) => handleReturSuccess(sale.id, total)}
                            onCancel={() => setReturningId(null)}
                          />

                        ) : (
                          <>
                            <table className="w-full mt-3 text-base">
                              <thead>
                                <tr className="text-gray-500 text-sm uppercase tracking-wide">
                                  <th className="text-left pb-2 font-medium">Produk</th>
                                  <th className="text-right pb-2 font-medium">Qty</th>
                                  <th className="text-right pb-2 font-medium">Harga</th>
                                  <th className="text-right pb-2 font-medium">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {items.map(item => (
                                  <tr key={item.id}>
                                    <td className="py-2 text-gray-900 pr-3">{item.product_name}</td>
                                    <td className="py-2 text-gray-500 text-right whitespace-nowrap">
                                      {fmtQty(Number(item.qty))} {item.unit_name}
                                    </td>
                                    <td className="py-2 text-gray-500 text-right whitespace-nowrap">{rp(item.unit_price)}</td>
                                    <td className="py-2 text-orange-600 font-semibold text-right whitespace-nowrap">{rp(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-gray-200">
                                  <td colSpan={3} className="pt-3 text-gray-500 text-sm">Total</td>
                                  <td className="pt-3 text-gray-900 font-bold text-right">{rp(sale.total)}</td>
                                </tr>
                                {(returnsCache[sale.id] ?? 0) > 0 && (
                                  <tr>
                                    <td colSpan={3} className="pt-1.5 text-amber-600 text-sm">Diretur</td>
                                    <td className="pt-1.5 text-amber-500 font-semibold text-right">−{rp(returnsCache[sale.id])}</td>
                                  </tr>
                                )}
                                {(returnsCache[sale.id] ?? 0) > 0 && (
                                  <tr>
                                    <td colSpan={3} className="pt-1 text-gray-500 text-sm">Sisa Efektif</td>
                                    <td className="pt-1 text-gray-400 font-semibold text-right">{rp(sale.total - returnsCache[sale.id])}</td>
                                  </tr>
                                )}
                              </tfoot>
                            </table>

                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={() => setReturningId(sale.id)}
                                className="text-sm text-amber-500 hover:text-amber-600 font-medium transition-colors"
                              >
                                Buat Retur →
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {!trimmed && (
                <div ref={sentinelRef} className="py-4 text-center">
                  {loadingMore && <p className="text-gray-500 text-sm">Memuat...</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
