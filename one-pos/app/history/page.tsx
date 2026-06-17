'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────

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
  product_id: number
  unit_id: number
  product_name: string
  unit_name: string
  factor_to_base: number
  qty: number
  unit_price: number
  subtotal: number
}

// Item yang bisa diretur (setelah dikurangi yang sudah diretur sebelumnya)
type ReturnableItem = {
  sale_item_id: number
  product_id: number
  product_name: string
  unit_name: string
  unit_price: number
  factor_to_base: number
  qty: number             // qty asli
  already_returned: number
  max_qty: number         // qty - already_returned
}

type Filter    = 'today' | 'week' | 'all'
type PayFilter = 'all' | 'lunas' | 'belum'

// ── Constants & helpers ────────────────────────────────────────

const PAGE_SIZE = 30

const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

const fmtQty = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('id-ID', { maximumFractionDigits: 4 })

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

// ── Component ──────────────────────────────────────────────────

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

  // ── Retur state ───────────────────────────────────────────────
  const [returningId, setReturningId]         = useState<number | null>(null)
  const [returnableItems, setReturnableItems] = useState<ReturnableItem[]>([])
  const [returnQtys, setReturnQtys]           = useState<Record<number, number>>({})
  const [returnNote, setReturnNote]           = useState('')
  const [returnRefundMethod, setReturnRefundMethod] = useState<'tunai' | 'transfer' | 'nota'>('tunai')
  const [loadingReturn, setLoadingReturn]     = useState(false)
  const [submittingReturn, setSubmittingReturn] = useState(false)
  const [returnSuccess, setReturnSuccess]     = useState<string | null>(null)
  const [returnError, setReturnError]         = useState<string | null>(null)

  // ── Auth ──────────────────────────────────────────────────────

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
      cancelRetur()
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

    // Simpan total diretur
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

  // ── Retur helpers ─────────────────────────────────────────────

  function cancelRetur() {
    setReturningId(null)
    setReturnableItems([])
    setReturnQtys({})
    setReturnNote('')
    setReturnRefundMethod('tunai')
    setReturnError(null)
  }

  async function startRetur(saleId: number) {
    const items = itemsCache[saleId]
    if (!items || items.length === 0) return

    setReturningId(saleId)
    setReturnQtys({})
    setReturnNote('')
    setLoadingReturn(true)

    const sb = createClient()
    const saleItemIds = items.map(i => i.id)

    // Cari qty yang sudah diretur sebelumnya per item
    const { data: prevReturns } = await sb
      .from('return_items')
      .select('sale_item_id, qty')
      .in('sale_item_id', saleItemIds)

    const returnedMap: Record<number, number> = {}
    for (const r of prevReturns ?? []) {
      returnedMap[r.sale_item_id] = (returnedMap[r.sale_item_id] ?? 0) + Number(r.qty)
    }

    const list: ReturnableItem[] = items
      .map(item => {
        const already  = returnedMap[item.id] ?? 0
        const max_qty  = Number(item.qty) - already
        return {
          sale_item_id:    item.id,
          product_id:      item.product_id,
          product_name:    item.product_name,
          unit_name:       item.unit_name,
          unit_price:      item.unit_price,
          factor_to_base:  item.factor_to_base,
          qty:             Number(item.qty),
          already_returned: already,
          max_qty,
        }
      })
      .filter(i => i.max_qty > 0)  // sembunyikan item yang sudah full-retur

    setReturnableItems(list)
    setLoadingReturn(false)
  }

  async function confirmRetur(saleId: number) {
    const toReturn = returnableItems.filter(i => (returnQtys[i.sale_item_id] ?? 0) > 0)
    if (toReturn.length === 0 || !user) return

    // Validasi client-side sebelum kirim ke server
    const overLimit = toReturn.find(i => {
      const qty = returnQtys[i.sale_item_id] ?? 0
      return qty > i.max_qty
    })
    if (overLimit) {
      setReturnError(`Qty retur "${overLimit.product_name}" melebihi batas (maks ${overLimit.max_qty} ${overLimit.unit_name})`)
      return
    }

    setSubmittingReturn(true)
    setReturnError(null)

    const { data, error } = await createClient().rpc('confirm_return', {
      p_sale_id:       saleId,
      p_cashier_id:    user.id,
      p_refund_method: returnRefundMethod,
      p_note:          returnNote || null,
      p_items:         toReturn.map(i => ({
        sale_item_id: i.sale_item_id,
        qty:          returnQtys[i.sale_item_id]!,
      })),
    })

    setSubmittingReturn(false)

    if (error || !data) {
      // Pesan error dari server (misal: qty melebihi sisa retur)
      const msg = error?.message ?? 'Gagal menyimpan retur'
      setReturnError(msg.includes('Qty retur') ? msg : 'Gagal menyimpan retur. Coba lagi.')
      return
    }

    const total = Number((data as { total: number }).total)
    cancelRetur()
    setReturnSuccess(`Retur ${rp(total)} berhasil dicatat`)
    setTimeout(() => setReturnSuccess(null), 4000)
    // Invalidate cache agar data retur fresh saat dibuka lagi
    setItemsCache(c => { const copy = { ...c }; delete copy[saleId]; return copy })
    setReturnsCache(c => { const copy = { ...c }; delete copy[saleId]; return copy })
  }

  // ── Render guard ──────────────────────────────────────────────

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

  // ── UI ────────────────────────────────────────────────────────

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
                filter === f ? 'bg-indigo-600 text-white' : 'bg-white/8 text-gray-400 hover:bg-white/15'
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
                  ? val === 'lunas' ? 'bg-green-600/30 text-green-300 ring-1 ring-green-500/50'
                  : val === 'belum' ? 'bg-amber-600/30 text-amber-300 ring-1 ring-amber-500/50'
                  :                   'bg-white/15 text-white'
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
                const isOpen    = expandedId === sale.id
                const items     = itemsCache[sale.id]
                const isRetur   = returningId === sale.id
                const returTotal = returnableItems.reduce(
                  (s, i) => s + (returnQtys[i.sale_item_id] ?? 0) * i.unit_price, 0
                )
                const hasAnyRetur = returnableItems.some(i => (returnQtys[i.sale_item_id] ?? 0) > 0)

                return (
                  <div
                    key={sale.id}
                    className={`border rounded-2xl transition-colors ${
                      isOpen
                        ? isRetur
                          ? 'bg-gray-900 border-amber-500/40'
                          : 'bg-gray-900 border-indigo-500/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Header */}
                    <button className="w-full text-left p-4" onClick={() => toggleDetail(sale.id)}>
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
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">Antar</span>
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
                            {sale.customer_name && <><span>·</span><span>{sale.customer_name}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-white font-bold text-base">{rp(sale.total)}</span>
                          <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {/* Detail / Retur panel */}
                    {isOpen && (
                      <div className="border-t border-white/10 px-4 pb-4">

                        {/* Success banner */}
                        {returnSuccess && (
                          <div className="mt-3 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium">
                            ✓ {returnSuccess}
                          </div>
                        )}

                        {/* Error banner */}
                        {returnError && isRetur && (
                          <div className="mt-3 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm flex items-start justify-between gap-2">
                            <span>{returnError}</span>
                            <button onClick={() => setReturnError(null)} className="shrink-0 opacity-60 hover:opacity-100 text-xs mt-0.5">✕</button>
                          </div>
                        )}

                        {loadingItems && !items ? (
                          <p className="text-gray-500 text-xs text-center py-3">Memuat item...</p>
                        ) : !items || items.length === 0 ? (
                          <p className="text-gray-600 text-xs text-center py-3">Tidak ada item</p>

                        ) : isRetur ? (
                          /* ── MODE RETUR ── */
                          <div className="mt-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-amber-400 text-xs font-bold uppercase tracking-wide">Pilih Item & Qty Retur</p>
                              <button
                                onClick={cancelRetur}
                                className="text-gray-500 hover:text-white text-xs"
                              >✕ Batal</button>
                            </div>

                            {loadingReturn ? (
                              <p className="text-gray-500 text-xs text-center py-3">Memuat data retur...</p>
                            ) : returnableItems.length === 0 ? (
                              <p className="text-gray-600 text-xs text-center py-3">Semua item sudah diretur</p>
                            ) : (
                              <>
                                <div className="divide-y divide-white/5">
                                  {returnableItems.map(item => {
                                    const qty = returnQtys[item.sale_item_id] ?? 0
                                    const setQty = (v: number) => setReturnQtys(prev => ({
                                      ...prev,
                                      [item.sale_item_id]: Math.max(0, Math.min(v, item.max_qty)),
                                    }))
                                    return (
                                      <div key={item.sale_item_id} className="py-3 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white text-sm font-medium truncate">{item.product_name}</p>
                                          <p className="text-gray-500 text-xs mt-0.5">
                                            {fmtQty(item.qty)} {item.unit_name}
                                            {item.already_returned > 0 && (
                                              <span className="text-amber-600 ml-1.5">· diretur {fmtQty(item.already_returned)}</span>
                                            )}
                                            <span className="text-gray-600 ml-1.5">· maks {fmtQty(item.max_qty)}</span>
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => setQty(qty - 1)}
                                            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center"
                                          >−</button>
                                          <input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            max={item.max_qty}
                                            step="any"
                                            value={qty === 0 ? '' : qty}
                                            placeholder="0"
                                            onChange={e => {
                                              const v = parseFloat(e.target.value)
                                              setQty(isNaN(v) ? 0 : v)
                                            }}
                                            onFocus={e => e.target.select()}
                                            className="w-16 text-white text-sm text-center bg-white/10 border border-white/15 focus:border-amber-500 rounded-lg h-7 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                          />
                                          <button
                                            onClick={() => setQty(qty + 1)}
                                            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center"
                                          >+</button>
                                          <span className="text-gray-600 text-xs w-10 text-right">{item.unit_name}</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                <input
                                  placeholder="Catatan retur (opsional)…"
                                  value={returnNote}
                                  onChange={e => setReturnNote(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 focus:border-amber-500 text-white placeholder-gray-600 rounded-xl px-3 py-2 text-sm outline-none"
                                />

                                {/* Metode refund */}
                                <div>
                                  <p className="text-gray-600 text-xs mb-1.5">Kembalikan via</p>
                                  <div className="flex gap-2">
                                    {([
                                      ['tunai',    'Tunai'],
                                      ['transfer', 'Transfer'],
                                      ['nota',     'Nota/Kredit'],
                                    ] as const).map(([val, label]) => (
                                      <button
                                        key={val}
                                        onClick={() => setReturnRefundMethod(val)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                          returnRefundMethod === val
                                            ? 'bg-amber-600 text-white'
                                            : 'bg-white/8 text-gray-400 hover:bg-white/15'
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  {returnRefundMethod !== 'tunai' && (
                                    <p className="text-gray-600 text-xs mt-1">
                                      Tidak mempengaruhi saldo kas harian
                                    </p>
                                  )}
                                </div>

                                <button
                                  onClick={() => confirmRetur(sale.id)}
                                  disabled={!hasAnyRetur || submittingReturn}
                                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-30 text-white text-sm font-bold transition-colors"
                                >
                                  {submittingReturn
                                    ? 'Memproses…'
                                    : hasAnyRetur
                                      ? `Konfirmasi Retur · ${rp(returTotal)}`
                                      : 'Masukkan qty retur'}
                                </button>
                              </>
                            )}
                          </div>

                        ) : (
                          /* ── MODE NORMAL ── */
                          <>
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
                                      {fmtQty(Number(item.qty))} {item.unit_name}
                                    </td>
                                    <td className="py-2 text-gray-400 text-right whitespace-nowrap">{rp(item.unit_price)}</td>
                                    <td className="py-2 text-indigo-300 font-semibold text-right whitespace-nowrap">{rp(item.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-white/10">
                                  <td colSpan={3} className="pt-3 text-gray-500 text-xs">Total</td>
                                  <td className="pt-3 text-white font-bold text-right">{rp(sale.total)}</td>
                                </tr>
                                {(returnsCache[sale.id] ?? 0) > 0 && (
                                  <tr>
                                    <td colSpan={3} className="pt-1.5 text-amber-600 text-xs">Diretur</td>
                                    <td className="pt-1.5 text-amber-500 font-semibold text-right">−{rp(returnsCache[sale.id])}</td>
                                  </tr>
                                )}
                                {(returnsCache[sale.id] ?? 0) > 0 && (
                                  <tr>
                                    <td colSpan={3} className="pt-1 text-gray-500 text-xs">Sisa Efektif</td>
                                    <td className="pt-1 text-gray-300 font-semibold text-right">{rp(sale.total - returnsCache[sale.id])}</td>
                                  </tr>
                                )}
                              </tfoot>
                            </table>

                            <div className="mt-3 flex justify-end">
                              <button
                                onClick={() => startRetur(sale.id)}
                                className="text-xs text-amber-500 hover:text-amber-400 font-medium transition-colors"
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
