'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { ProductFull, UnitFormRow } from '../_types'
import { rp, fmtQty } from '../_helpers'

const PROD_PAGE = 40

const emptyUnit = (): UnitFormRow => ({
  unit_name: '', factor_to_base: '1', price: '', price_toko: '', is_default: false,
})

function mergeUnits(prods: any[], units: any[]): ProductFull[] {
  return prods.map(p => ({
    ...p,
    product_units: units
      .filter((u: any) => u.product_id === p.id)
      .map((u: any) => ({
        id: u.id, unit_name: u.unit_name,
        factor_to_base: Number(u.factor_to_base),
        price: Number(u.price),
        price_toko: u.price_toko != null ? Number(u.price_toko) : null,
        is_default: u.is_default,
      })),
  }))
}

export default function TabProduk({ user }: { user: User }) {
  const sb = createClient()
  const [products, setProducts]           = useState<ProductFull[]>([])
  const [loading, setLoading]             = useState(false)
  const [search, setSearch]               = useState('')
  const [hasMore, setHasMore]             = useState(false)
  const [loadingMore, setLoadingMore]     = useState(false)
  const [showForm, setShowForm]           = useState(false)
  const [editing, setEditing]             = useState<ProductFull | null>(null)
  const [saving, setSaving]               = useState(false)
  const [msg, setMsg]                     = useState<{ ok: boolean; text: string } | null>(null)
  const [togglingId, setTogglingId]       = useState<number | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const [pName, setPName]         = useState('')
  const [pBase, setPBase]         = useState('')
  const [pSku, setPSku]           = useState('')
  const [pCat, setPCat]           = useState('')
  const [pUnits, setPUnits]       = useState<UnitFormRow[]>([{ ...emptyUnit(), is_default: true }])

  const load = useCallback(async (q: string) => {
    setLoading(true); setProducts([]); setHasMore(false)
    let query = sb.from('products').select('id, name, base_unit, sku, category, active').order('name').range(0, PROD_PAGE - 1)
    if (q.trim()) query = (query as any).ilike('name', `%${q.trim()}%`)
    const { data: prods } = await query
    if (!prods || prods.length === 0) { setLoading(false); return }
    const { data: units } = await sb.from('product_units').select('id, product_id, unit_name, factor_to_base, price, price_toko, is_default').in('product_id', prods.map((p: any) => p.id)).order('is_default', { ascending: false })
    setProducts(mergeUnits(prods, units ?? []))
    setHasMore(prods.length === PROD_PAGE)
    setLoading(false)
  }, [sb])

  useEffect(() => { load('') }, [load])
  useEffect(() => {
    const t = setTimeout(() => load(search), 350)
    return () => clearTimeout(t)
  }, [search, load])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const offset = products.length
    let query = sb.from('products').select('id, name, base_unit, sku, category, active').order('name').range(offset, offset + PROD_PAGE - 1)
    if (search.trim()) query = (query as any).ilike('name', `%${search.trim()}%`)
    const { data: prods } = await query
    if (!prods || prods.length === 0) { setHasMore(false); setLoadingMore(false); return }
    const { data: units } = await sb.from('product_units').select('id, product_id, unit_name, factor_to_base, price, price_toko, is_default').in('product_id', prods.map((p: any) => p.id)).order('is_default', { ascending: false })
    setProducts(prev => [...prev, ...mergeUnits(prods, units ?? [])])
    setHasMore(prods.length === PROD_PAGE)
    setLoadingMore(false)
  }

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore() }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, loadingMore, products.length])

  function openNew() {
    setEditing(null); setPName(''); setPBase(''); setPSku(''); setPCat('')
    setPUnits([{ ...emptyUnit(), is_default: true }]); setMsg(null); setShowForm(true)
  }

  function openEdit(p: ProductFull) {
    setEditing(p); setPName(p.name); setPBase(p.base_unit); setPSku(p.sku ?? ''); setPCat(p.category ?? '')
    setPUnits(p.product_units.map(u => ({
      id: u.id, unit_name: u.unit_name,
      factor_to_base: String(u.factor_to_base),
      price: String(u.price),
      price_toko: u.price_toko != null ? String(u.price_toko) : '',
      is_default: u.is_default,
    })))
    setMsg(null); setShowForm(true)
  }

  async function save() {
    if (!pName.trim() || !pBase.trim()) { setMsg({ ok: false, text: 'Nama dan satuan dasar wajib diisi' }); return }
    const validUnits = pUnits.filter(u => u.unit_name.trim() && u.price.trim())
    if (validUnits.length === 0) { setMsg({ ok: false, text: 'Minimal satu satuan jual harus diisi' }); return }
    if (!validUnits.some(u => u.is_default)) { setMsg({ ok: false, text: 'Pilih satu satuan sebagai default' }); return }

    setSaving(true); setMsg(null)

    if (editing) {
      const { error: pErr } = await sb.from('products').update({ name: pName.trim(), base_unit: pBase.trim(), sku: pSku.trim() || null, category: pCat.trim() || null }).eq('id', editing.id)
      if (pErr) { setMsg({ ok: false, text: pErr.message }); setSaving(false); return }
      for (const u of validUnits) {
        const uData = { product_id: editing.id, unit_name: u.unit_name.trim(), factor_to_base: parseFloat(u.factor_to_base) || 1, price: parseFloat(u.price) || 0, price_toko: u.price_toko.trim() ? parseFloat(u.price_toko) : null, is_default: u.is_default }
        const { error } = u.id ? await sb.from('product_units').update(uData).eq('id', u.id) : await sb.from('product_units').insert(uData)
        if (error) { setMsg({ ok: false, text: error.message }); setSaving(false); return }
      }
      setMsg({ ok: true, text: `"${pName}" berhasil diperbarui` })
    } else {
      const { data: newProd, error: pErr } = await sb.from('products').insert({ name: pName.trim(), base_unit: pBase.trim(), sku: pSku.trim() || null, category: pCat.trim() || null, active: true }).select('id').single()
      if (pErr || !newProd) { setMsg({ ok: false, text: pErr?.message ?? 'Gagal menyimpan' }); setSaving(false); return }
      const unitRows = validUnits.map(u => ({ product_id: (newProd as any).id, unit_name: u.unit_name.trim(), factor_to_base: parseFloat(u.factor_to_base) || 1, price: parseFloat(u.price) || 0, price_toko: u.price_toko.trim() ? parseFloat(u.price_toko) : null, is_default: u.is_default }))
      const { error: uErr } = await sb.from('product_units').insert(unitRows)
      if (uErr) { setMsg({ ok: false, text: uErr.message }); setSaving(false); return }
      setMsg({ ok: true, text: `Produk "${pName}" berhasil ditambahkan` })
    }

    setSaving(false); load(search)
    setTimeout(() => { setShowForm(false); setMsg(null) }, 1500)
  }

  async function toggleActive(p: ProductFull) {
    setTogglingId(p.id)
    await sb.from('products').update({ active: !p.active }).eq('id', p.id)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
    setTogglingId(null)
  }

  return (
    <div className="space-y-3 mt-1">
      <div className="flex items-center justify-between">
        <p className="text-gray-900 font-bold text-base">Daftar Produk</p>
        <button
          onClick={() => { if (showForm) { setShowForm(false); setMsg(null) } else openNew() }}
          className="text-sm font-semibold px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Produk'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <p className="text-gray-900 font-semibold text-base">{editing ? `Edit: ${editing.name}` : 'Produk Baru'}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-gray-500 text-sm mb-1 block">Nama Produk *</label>
              <input className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200" placeholder="cth: Semen Tiga Roda" value={pName} onChange={e => setPName(e.target.value)} />
            </div>
            <div>
              <label className="text-gray-500 text-sm mb-1 block">Satuan Dasar *</label>
              <input className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200" placeholder="cth: sak, pcs, kg" value={pBase} onChange={e => setPBase(e.target.value)} />
            </div>
            <div>
              <label className="text-gray-500 text-sm mb-1 block">SKU / Kode</label>
              <input className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200" placeholder="opsional" value={pSku} onChange={e => setPSku(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-gray-500 text-sm mb-1 block">Kategori</label>
              <input className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200" placeholder="opsional" value={pCat} onChange={e => setPCat(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-500 text-sm font-semibold uppercase tracking-wide">Satuan Jual</label>
              <button onClick={() => setPUnits(prev => [...prev, emptyUnit()])} className="text-sm text-orange-500 hover:text-orange-600 font-semibold">+ Tambah Satuan</button>
            </div>
            <div className="space-y-3">
              {pUnits.map((u, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPUnits(prev => prev.map((x, j) => ({ ...x, is_default: j === i })))}
                        className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${u.is_default ? 'bg-orange-500 border-orange-500' : 'border-gray-400 hover:border-orange-400'}`}
                        title="Jadikan default"
                      />
                      <span className="text-gray-500 text-sm">{u.is_default ? 'Default' : 'Jadikan default'}</span>
                    </div>
                    {pUnits.length > 1 && !u.id && (
                      <button onClick={() => setPUnits(prev => prev.filter((_, j) => j !== i))} className="text-red-500/60 hover:text-red-600 text-sm">Hapus</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-gray-500 text-[11px] mb-1 block">Nama Satuan *</label>
                      <input className="w-full bg-white text-gray-900 placeholder-gray-400 rounded-lg px-2.5 py-2 text-base outline-none focus:ring-1 focus:ring-orange-500 border border-gray-200" placeholder="cth: sak, lusin" value={u.unit_name} onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, unit_name: e.target.value } : x))} />
                    </div>
                    <div>
                      <label className="text-gray-500 text-[11px] mb-1 block">Faktor ke {pBase || 'base'}</label>
                      <input type="number" min="0.001" step="any" className="w-full bg-white text-gray-900 placeholder-gray-400 rounded-lg px-2.5 py-2 text-base outline-none focus:ring-1 focus:ring-orange-500 border border-gray-200" placeholder="1" value={u.factor_to_base} onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, factor_to_base: e.target.value } : x))} />
                    </div>
                    <div>
                      <label className="text-gray-500 text-[11px] mb-1 block">Harga Retail *</label>
                      <input type="number" min="0" className="w-full bg-white text-gray-900 placeholder-gray-400 rounded-lg px-2.5 py-2 text-base outline-none focus:ring-1 focus:ring-orange-500 border border-gray-200" placeholder="0" value={u.price} onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                    </div>
                    <div>
                      <label className="text-gray-500 text-[11px] mb-1 block">Harga Toko</label>
                      <input type="number" min="0" className="w-full bg-white text-gray-900 placeholder-gray-400 rounded-lg px-2.5 py-2 text-base outline-none focus:ring-1 focus:ring-orange-500 border border-gray-200" placeholder="opsional" value={u.price_toko} onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, price_toko: e.target.value } : x))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {msg && <p className={`text-sm px-3 py-2 rounded-xl ${msg.ok ? 'bg-green-500/10 text-green-600' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setMsg(null) }} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-500 text-base hover:bg-gray-200 transition-colors">Batal</button>
            <button disabled={saving} onClick={save} className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white font-bold text-base transition-colors">
              {saving ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah Produk'}
            </button>
          </div>
        </div>
      )}

      <input
        className="w-full bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500"
        placeholder="Cari nama atau SKU..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-gray-500 text-center mt-12 text-base">Memuat produk...</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500 text-center mt-12 text-base">
          {search.trim() ? `Tidak ditemukan: "${search}"` : 'Belum ada produk'}
        </p>
      ) : (
        products.map(p => (
          <div key={p.id} className={`border rounded-2xl p-4 ${p.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-gray-900 font-semibold text-base">{p.name}</p>
                  {!p.active && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-500/20 text-gray-500">Nonaktif</span>}
                  {p.sku && <span className="text-[10px] font-mono text-gray-500">{p.sku}</span>}
                </div>
                <p className="text-gray-500 text-sm mt-0.5">Satuan dasar: {p.base_unit}{p.category ? ` · ${p.category}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.product_units.map(u => (
                    <div key={u.id} className={`text-sm px-2 py-1 rounded-lg border ${u.is_default ? 'bg-orange-500/15 border-orange-500/30 text-orange-600' : 'bg-white border-gray-200 text-gray-500'}`}>
                      <span className="font-semibold">{u.unit_name}</span>
                      {u.factor_to_base !== 1 && <span className="text-gray-500"> ×{fmtQty(u.factor_to_base)}</span>}
                      <span className="ml-1 text-gray-500">{rp(u.price)}</span>
                      {u.price_toko != null && <span className="ml-1 text-amber-500/70">/ {rp(u.price_toko)}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => openEdit(p)} className="px-2.5 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-colors">Edit</button>
                <button
                  onClick={() => toggleActive(p)}
                  disabled={togglingId === p.id}
                  className={`px-2.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 ${p.active ? 'bg-red-50 text-red-600 border-red-500/30 hover:bg-red-500/20' : 'bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20'}`}
                >
                  {togglingId === p.id ? '...' : p.active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      <div ref={sentinelRef} className="py-3 text-center">
        {loadingMore && <p className="text-gray-500 text-sm">Memuat lebih banyak...</p>}
        {!loadingMore && !hasMore && products.length > 0 && <p className="text-gray-500 text-sm">{products.length} produk ditampilkan</p>}
      </div>
    </div>
  )
}
