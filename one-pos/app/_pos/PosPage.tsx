'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────────────────

type Unit = {
  id: number
  unit_name: string
  factor_to_base: number
  price: number
  price_toko: number | null
  is_default: boolean
}

type Product = {
  id: number
  sku: string | null
  name: string
  category: string | null
  base_unit: string
  product_units: Unit[]
  section?: 'favorit' | 'terlaris'
}

type Customer = {
  id: number
  name: string
  phone: string | null
  category: 'retail' | 'toko'
}

type CartItem = {
  key: string
  product: Product
  unit: Unit
  qty: number
  unit_price: number
  subtotal: number
}

type PayMethod = 'tunai' | 'transfer' | 'cod' | 'kredit'

// ── Helpers ────────────────────────────────────────────────────────────────

const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

function resolvePrice(unit: Unit, tier: 'retail' | 'toko'): number {
  return tier === 'toko' && unit.price_toko != null ? unit.price_toko : unit.price
}

const PAY_METHODS: { v: PayMethod; label: string }[] = [
  { v: 'tunai',    label: 'Tunai' },
  { v: 'transfer', label: 'Transfer' },
  { v: 'cod',      label: 'COD' },
  { v: 'kredit',   label: 'Kredit' },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function PosPage({ user, kasirName }: { user: User; kasirName: string }) {
  // Product search
  const [query, setQuery]                   = useState('')
  const [activeCategory, setActiveCat]      = useState<string | null>(null)
  const [categories, setCategories]         = useState<string[]>([])
  const [products, setProducts]             = useState<Product[]>([])
  const [loadingProd, setLoadingProd]       = useState(false)
  const [defaultProds, setDefaultProds]     = useState<Product[]>([])
  const [loadingDefault, setLoadingDefault] = useState(false)

  // Customer
  const [custQuery, setCustQuery]       = useState('')
  const [custResults, setCustResults]   = useState<Customer[]>([])
  const [customer, setCustomer]         = useState<Customer | null>(null)
  const [custOpen, setCustOpen]         = useState(false)
  const custRef                         = useRef<HTMLDivElement>(null)

  // Cart
  const [cart, setCart]                 = useState<CartItem[]>([])
  const [fulfillment, setFulfillment]   = useState<'ambil' | 'antar'>('ambil')

  // Add-item overlay
  const [picking, setPicking]           = useState<Product | null>(null)
  const [pickUnit, setPickUnit]         = useState<Unit | null>(null)
  const [pickQty, setPickQty]           = useState(1)

  // Checkout overlay
  const [checkingOut, setCheckingOut]   = useState(false)
  const [payMethod, setPayMethod]       = useState<PayMethod>('tunai')
  const [submitting, setSubmitting]     = useState(false)
  const [lastNota, setLastNota]         = useState<string | null>(null)
  const [checkoutErr, setCheckoutErr]   = useState<string | null>(null)

  // ── Derived ──────────────────────────────────────────────────────────────

  const tier       = customer?.category ?? 'retail'
  const cartTotal  = cart.reduce((s, i) => s + i.subtotal, 0)
  const cartCount  = cart.reduce((s, i) => s + i.qty, 0)

  // ── Fetch categories once ─────────────────────────────────────────────────

  useEffect(() => {
    createClient()
      .from('products')
      .select('category')
      .eq('active', true)
      .not('category', 'is', null)
      .then(({ data }) => {
        const cats = [...new Set((data ?? []).map(r => r.category as string))].sort()
        setCategories(cats)
      })
  }, [])

  // ── Close customer dropdown on outside click ──────────────────────────────

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) {
        setCustOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  // ── Default products: favorit (manual) + terlaris (dari sale_items) ────────

  useEffect(() => {
    if (query || activeCategory) return
    setLoadingDefault(true)
    const sb = createClient()
    const fetchDefault = async () => {
      const { data: rows, error } = await sb.rpc('get_default_products', { p_limit: 48 })
      if (error || !rows || rows.length === 0) {
        setDefaultProds([])
        setLoadingDefault(false)
        return
      }
      const { data: units } = await sb
        .from('product_units').select('*')
        .in('product_id', (rows as any[]).map(r => r.id))

      const merged: Product[] = (rows as any[]).map(r => ({
        id: r.id, sku: r.sku, name: r.name,
        category: r.category, base_unit: r.base_unit,
        section: r.section as 'favorit' | 'terlaris',
        product_units: (units ?? [])
          .filter((u: any) => String(u.product_id) === String(r.id))
          .sort((a: any, b: any) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0)),
      }))
      setDefaultProds(merged)
      setLoadingDefault(false)
    }
    fetchDefault()
  }, [query, activeCategory])

  // ── Search products — dua langkah supaya product_units pasti ke-fetch ────

  useEffect(() => {
    if (!query && !activeCategory) { setProducts([]); return }
    setLoadingProd(true)
    const t = setTimeout(async () => {
      const sb = createClient()

      let q = sb
        .from('products')
        .select('id, sku, name, category, base_unit')
        .eq('active', true)
        .order('name')
        .limit(48)
      if (query.length >= 2) q = q.ilike('name', `%${query}%`)
      if (activeCategory)    q = q.eq('category', activeCategory)

      const { data: prods } = await q
      if (!prods || prods.length === 0) { setProducts([]); setLoadingProd(false); return }

      const { data: units, error: unitsErr } = await sb
        .from('product_units')
        .select('*')
        .in('product_id', prods.map(p => p.id))
      if (unitsErr) console.error('[POS] units error:', unitsErr.message)

      const merged: Product[] = prods.map(p => ({
        ...p,
        product_units: (units ?? [])
          .filter((u: any) => String(u.product_id) === String(p.id))
          .sort((a: any, b: any) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0)),
      }))

      setProducts(merged)
      setLoadingProd(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, activeCategory])

  // ── Search customers (debounced) ──────────────────────────────────────────

  useEffect(() => {
    if (custQuery.length < 2) { setCustResults([]); return }
    const t = setTimeout(async () => {
      const { data, error } = await createClient()
        .from('customers')
        .select('id, name, phone, category')
        .ilike('name', `%${custQuery}%`)
        .limit(8)
      if (!error && data) setCustResults(data as Customer[])
    }, 300)
    return () => clearTimeout(t)
  }, [custQuery])

  // ── Re-price cart when tier changes ──────────────────────────────────────

  useEffect(() => {
    setCart(prev => prev.map(i => {
      const unit_price = resolvePrice(i.unit, tier)
      return { ...i, unit_price, subtotal: i.qty * unit_price }
    }))
  }, [tier])

  // ── Cart helpers ──────────────────────────────────────────────────────────

  function openPicking(product: Product) {
    const def = product.product_units.find(u => u.is_default) ?? product.product_units[0]
    setPicking(product)
    setPickUnit(def ?? null)
    setPickQty(1)
  }

  function addToCart() {
    if (!picking || !pickUnit) return
    const unit_price = resolvePrice(pickUnit, tier)
    const key = `${picking.id}-${pickUnit.id}`
    setCart(prev => {
      const found = prev.find(i => i.key === key)
      if (found) return prev.map(i => i.key === key
        ? { ...i, qty: i.qty + pickQty, subtotal: (i.qty + pickQty) * unit_price }
        : i)
      return [...prev, { key, product: picking!, unit: pickUnit!, qty: pickQty, unit_price, subtotal: pickQty * unit_price }]
    })
    setPicking(null)
  }

  function updateQty(key: string, delta: number) {
    setCart(prev =>
      prev
        .map(i => i.key === key ? { ...i, qty: i.qty + delta, subtotal: (i.qty + delta) * i.unit_price } : i)
        .filter(i => i.qty > 0)
    )
  }

  function setCartQty(key: string, qty: number) {
    if (qty <= 0) return
    setCart(prev => prev.map(i => i.key === key
      ? { ...i, qty, subtotal: qty * i.unit_price }
      : i
    ))
  }

  // ── Confirm sale ──────────────────────────────────────────────────────────

  async function confirmSale() {
    if (cart.length === 0) return
    if (fulfillment === 'antar' && !customer) {
      setCheckoutErr('Pilih pelanggan dulu untuk pengiriman.')
      return
    }
    setCheckoutErr(null)
    setSubmitting(true)
    const sb = createClient()

    const { data: sale, error: saleErr } = await sb
      .from('sales')
      .insert({
        cashier_id:  user.id,
        customer_id: customer?.id ?? null,
        warehouse_id: 1,
        fulfillment,
        pay_method:  payMethod,
        pay_status:  payMethod === 'tunai' || payMethod === 'transfer' ? 'lunas' : 'belum',
        total:       cartTotal,
      })
      .select('id, code')
      .single()

    if (saleErr || !sale) {
      setCheckoutErr('Gagal menyimpan transaksi. Coba lagi.')
      setSubmitting(false)
      return
    }

    await sb.from('sale_items').insert(
      cart.map(i => ({
        sale_id:    sale.id,
        product_id: i.product.id,
        unit_id:    i.unit.id,
        qty:        i.qty,
        base_qty:   i.qty * i.unit.factor_to_base,
        unit_price: i.unit_price,
        subtotal:   i.subtotal,
      }))
    )

    if (fulfillment === 'ambil') {
      await sb.from('stock_movements').insert(
        cart.map(i => ({
          product_id:   i.product.id,
          warehouse_id: 1,
          base_qty:     -(i.qty * i.unit.factor_to_base),
          type:         'sale',
          ref_table:    'sales',
          ref_id:       sale.id,
          created_by:   user.id,
        }))
      )
    }

    setLastNota(sale.code)
    setCart([])
    setCustomer(null)
    setCustQuery('')
    setFulfillment('ambil')
    setPayMethod('tunai')
    setCheckingOut(false)
    setSubmitting(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden select-none">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-white/10 shrink-0">
        <span className="text-white font-bold text-base">Adi Jaya POS</span>
        <div className="flex items-center gap-4">
          <a
            href="/kas"
            className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
          >
            Kas
          </a>
          <a
            href="/history"
            className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
          >
            Riwayat
          </a>
          <a
            href="/admin"
            className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
          >
            Admin
          </a>
          <span className="text-gray-600 text-xs">{kasirName}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ════════════════════════════════════════════
            LEFT — Product panel
        ════════════════════════════════════════════ */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-white/10">

          {/* Search + category pills */}
          <div className="p-3 space-y-2 shrink-0 bg-gray-900/50">
            <input
              className="w-full bg-white/8 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
              placeholder="Cari nama atau SKU produk..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <CategoryPill
                label="Semua"
                active={activeCategory === null}
                onClick={() => setActiveCat(null)}
              />
              {categories.map(cat => (
                <CategoryPill
                  key={cat}
                  label={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCat(prev => prev === cat ? null : cat)}
                />
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {!query && !activeCategory ? (
              loadingDefault ? (
                <EmptyState text="Memuat..." />
              ) : defaultProds.length === 0 ? (
                <EmptyState text={'Belum ada produk favorit\nTandai produk lewat admin'} />
              ) : (
                <div className="space-y-4">
                  {(['favorit', 'terlaris'] as const).map(sec => {
                    const list = defaultProds.filter(p => p.section === sec)
                    if (list.length === 0) return null
                    return (
                      <div key={sec}>
                        <p className="text-gray-600 text-[10px] uppercase tracking-widest mb-2 px-1">
                          {sec === 'favorit' ? '⭐ Favorit' : '🔥 Terlaris'}
                        </p>
                        <ProductGrid products={list} picking={picking} tier={tier} onPick={openPicking} />
                      </div>
                    )
                  })}
                </div>
              )
            ) : loadingProd ? (
              <EmptyState text="Mencari..." />
            ) : products.length === 0 ? (
              <EmptyState text="Produk tidak ditemukan" />
            ) : (
              <ProductGrid products={products} picking={picking} tier={tier} onPick={openPicking} />
            )}
          </div>

          {/* ── Detail panel — slide up dari bawah panel kiri saat produk dipilih ── */}
          {picking && (
            <div className="shrink-0 border-t-2 border-indigo-500/60 bg-gray-900 p-4 space-y-3">
              {/* Baris atas: info produk + tombol tutup */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {picking.category && (
                    <p className="text-gray-500 text-[10px] uppercase tracking-wide">{picking.category}</p>
                  )}
                  <p className="text-white font-bold text-base leading-tight truncate">{picking.name}</p>
                  {pickUnit && (
                    <p className="text-indigo-400 font-bold text-sm mt-0.5">
                      {rp(resolvePrice(pickUnit, tier))}
                      <span className="text-gray-500 font-normal text-xs">/{pickUnit.unit_name}</span>
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setPicking(null)}
                  className="text-gray-500 hover:text-white text-lg leading-none shrink-0 mt-1"
                >✕</button>
              </div>

              {/* Unit selector */}
              {picking.product_units.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {picking.product_units.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setPickUnit(u)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        pickUnit?.id === u.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      {u.unit_name}
                      <span className="text-xs font-normal ml-1.5 opacity-60">{rp(resolvePrice(u, tier))}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Qty + tombol tambah dalam satu baris */}
              <div className="flex items-center gap-3 pl-10">
                <button
                  onClick={() => setPickQty(q => Math.max(1, q - 1))}
                  className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white text-2xl font-light flex items-center justify-center shrink-0"
                >−</button>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="any"
                  value={pickQty}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v) && v > 0) setPickQty(v)
                  }}
                  onFocus={e => e.target.select()}
                  className="w-20 text-white text-2xl font-bold text-center bg-white/10 border border-white/15 focus:border-indigo-500 rounded-xl h-12 outline-none focus:ring-2 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setPickQty(q => q + 1)}
                  className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white text-2xl font-light flex items-center justify-center shrink-0"
                >+</button>
                {pickUnit && (
                  <div className="flex-1 text-right">
                    <p className="text-gray-500 text-xs">Subtotal</p>
                    <p className="text-white font-bold text-base">{rp(pickQty * resolvePrice(pickUnit, tier))}</p>
                  </div>
                )}
                <Button
                  onClick={addToCart}
                  disabled={!pickUnit}
                  className="h-12 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 border-0 text-white font-bold text-sm shrink-0"
                >
                  + Tambah
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════
            RIGHT — Cart panel
        ════════════════════════════════════════════ */}
        <div className="w-80 lg:w-96 flex flex-col overflow-hidden shrink-0 bg-gray-900/30">

          {/* Customer picker */}
          <div ref={custRef} className="p-3 border-b border-white/10 shrink-0 relative">
            <input
              className="w-full bg-white/8 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
              placeholder="Cari pelanggan (opsional)..."
              value={custQuery}
              onChange={e => { setCustQuery(e.target.value); setCustOpen(true) }}
              onFocus={() => setCustOpen(true)}
            />
            {customer && (
              <div className="mt-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{customer.name}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                    customer.category === 'toko'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>{customer.category}</span>
                </div>
                <button
                  onClick={() => { setCustomer(null); setCustQuery('') }}
                  className="text-gray-600 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </div>
            )}
            {custOpen && custResults.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-gray-800 border border-white/10 rounded-2xl shadow-2xl z-10 overflow-hidden">
                {custResults.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-4 py-3 hover:bg-white/8 border-b border-white/5 last:border-0"
                    onClick={() => { setCustomer(c); setCustQuery(c.name); setCustOpen(false) }}
                  >
                    <span className="text-white text-sm font-medium">{c.name}</span>
                    {c.phone && <span className="text-gray-500 text-xs ml-2">{c.phone}</span>}
                    <span className={`ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                      c.category === 'toko'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>{c.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <EmptyState text={'Keranjang kosong\nTap produk untuk tambah'} />
            ) : (
              <ul className="p-3 space-y-2">
                {cart.map(item => (
                  <li key={item.key} className="bg-white/5 rounded-2xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-white text-sm font-medium leading-tight flex-1">{item.product.name}</p>
                      <button
                        onClick={() => updateQty(item.key, -item.qty)}
                        className="text-gray-600 hover:text-red-400 text-sm leading-none shrink-0"
                      >✕</button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.key, -1)}
                          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center leading-none"
                        >−</button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="any"
                          value={item.qty}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v > 0) setCartQty(item.key, v)
                          }}
                          onFocus={e => e.target.select()}
                          className="w-12 text-white text-sm font-semibold text-center bg-white/10 border border-white/15 focus:border-indigo-500 rounded-lg h-8 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => updateQty(item.key, 1)}
                          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center leading-none"
                        >+</button>
                        <span className="text-gray-500 text-xs">{item.unit.unit_name}</span>
                      </div>
                      <span className="text-indigo-300 text-sm font-bold">{rp(item.subtotal)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer: fulfillment + total + bayar */}
          <div className="p-3 border-t border-white/10 space-y-3 shrink-0">
            <div className="flex gap-2">
              {(['ambil', 'antar'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFulfillment(f)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    fulfillment === f
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/8 text-gray-400 hover:bg-white/15'
                  }`}
                >
                  {f === 'ambil' ? '🏪 Ambil' : '🚚 Antar'}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between px-1">
              <div>
                <span className="text-gray-500 text-xs">{cartCount} item</span>
                <span className="text-gray-600 mx-2">·</span>
                <span className="text-gray-500 text-xs uppercase">{tier}</span>
              </div>
              <span className="text-white text-2xl font-bold">{rp(cartTotal)}</span>
            </div>

            <Button
              disabled={cart.length === 0}
              onClick={() => { setCheckingOut(true); setCheckoutErr(null) }}
              className="w-full h-14 text-lg font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-25 border-0 text-white"
            >
              BAYAR →
            </Button>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          OVERLAY — Checkout
      ════════════════════════════════════════════ */}
      {checkingOut && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-20 p-4"
          onClick={() => !submitting && setCheckingOut(false)}
        >
          <div
            className="bg-gray-900 border border-white/15 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-white text-xl font-bold">Pembayaran</p>
              <div className="flex items-center gap-3">
                <p className="text-indigo-400 text-2xl font-bold">{rp(cartTotal)}</p>
                {!submitting && (
                  <button
                    onClick={() => setCheckingOut(false)}
                    className="text-gray-500 hover:text-white text-xl leading-none"
                  >✕</button>
                )}
              </div>
            </div>

            {checkoutErr && (
              <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-2.5">{checkoutErr}</p>
            )}

            {/* Metode bayar */}
            <div className="grid grid-cols-2 gap-2">
              {PAY_METHODS.map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setPayMethod(v)}
                  className={`py-3.5 rounded-xl text-sm font-semibold transition-colors ${
                    payMethod === v
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/8 text-gray-300 hover:bg-white/15'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button
              onClick={confirmSale}
              disabled={submitting}
              className="w-full h-14 text-lg font-bold rounded-2xl bg-green-600 hover:bg-green-500 border-0 text-white disabled:opacity-30"
            >
              {submitting ? 'Menyimpan...' : '✓ Konfirmasi Penjualan'}
            </Button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          OVERLAY — Sukses
      ════════════════════════════════════════════ */}
      {lastNota && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-30 p-6">
          <div className="bg-gray-900 border border-white/10 rounded-3xl p-10 text-center space-y-4 w-full max-w-xs">
            <p className="text-5xl">✅</p>
            <p className="text-white text-2xl font-bold">Berhasil!</p>
            <p className="text-gray-400 font-mono text-sm">{lastNota}</p>
            <Button
              onClick={() => setLastNota(null)}
              className="w-full h-12 text-base font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-500 border-0 text-white"
            >
              Transaksi Baru
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-white/8 text-gray-400 hover:bg-white/15'
      }`}
    >
      {label}
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-600 text-center text-sm whitespace-pre-line">{text}</p>
    </div>
  )
}

function ProductGrid({
  products, picking, tier, onPick,
}: {
  products: Product[]
  picking: Product | null
  tier: 'retail' | 'toko'
  onPick: (p: Product) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {products.map(p => {
        const def      = p.product_units.find(u => u.is_default) ?? p.product_units[0]
        const price    = def ? resolvePrice(def, tier) : null
        const selected = picking?.id === p.id
        return (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className={`text-left rounded-2xl p-3 transition-colors border ${
              selected
                ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/40'
                : 'bg-white/5 hover:bg-indigo-600/15 active:bg-indigo-600/30 border-white/10 hover:border-indigo-500/30'
            }`}
          >
            {p.category && (
              <span className="text-gray-500 text-[10px] uppercase tracking-wide">{p.category}</span>
            )}
            <p className="text-white font-medium text-sm leading-snug line-clamp-2 mt-0.5">{p.name}</p>
            {p.sku && <p className="text-gray-600 text-xs mt-0.5">{p.sku}</p>}
            {price != null && def && (
              <p className="text-indigo-400 font-bold text-sm mt-2">
                {rp(price)}
                <span className="text-gray-500 font-normal text-xs">/{def.unit_name}</span>
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}
