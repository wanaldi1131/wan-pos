'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { fmtQty, fmtDateTime } from '../_helpers'

// ── Types ─────────────────────────────────────────────────────────

type Warehouse = { id: number; name: string }
type Profile   = { id: string; full_name: string }

type TItem = {
  id: number
  product_id: number
  base_qty: number
  qty_in_unit: number | null
  unit: { id: number; unit_name: string } | null
  product: { id: number; name: string; base_unit: string } | null
}

type Transfer = {
  id: number
  from_wh: number
  to_wh: number
  status: 'in_transit' | 'received'
  carrier_id: string | null
  note: string | null
  created_at: string
  received_at: string | null
  from_warehouse: { id: number; name: string } | null
  to_warehouse:   { id: number; name: string } | null
  carrier: { id: string; full_name: string } | null
  creator: { id: string; full_name: string } | null
  transfer_items: TItem[]
}

type FormItem = {
  key: string
  product:  { id: number; name: string; base_unit: string }
  unit:     { id: number; unit_name: string; factor_to_base: number }
  qty:      number
}

type ProductHit = {
  id: number; name: string; base_unit: string
  product_units: { id: number; unit_name: string; factor_to_base: number; is_default: boolean }[]
}

// ── Surat Jalan HTML ───────────────────────────────────────────────

function suratJalanHtml(t: Transfer): string {
  const tgl = new Date(t.created_at).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const rows = t.transfer_items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.product?.name ?? '?'}</td>
      <td>${item.unit?.unit_name ?? item.product?.base_unit ?? '?'}</td>
      <td style="text-align:right">${fmtQty(item.qty_in_unit ?? item.base_qty)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="id"><head>
<meta charset="UTF-8">
<title>Surat Jalan TRF-${String(t.id).padStart(5, '0')}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11pt;margin:2cm;color:#111}
  h1{text-align:center;margin:0 0 4px}
  .sub{text-align:center;color:#555;font-size:10pt;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:20px}
  .lbl{font-size:9pt;color:#666}
  table{width:100%;border-collapse:collapse;margin-bottom:28px}
  th,td{border:1px solid #ccc;padding:5px 9px}
  th{background:#f2f2f2;font-size:10pt}
  .signs{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:48px}
  .sign{text-align:center;font-size:10pt}
  .line{border-top:1px solid #333;margin-top:60px;padding-top:4px}
</style>
</head><body>
<h1>SURAT JALAN</h1>
<p class="sub">No: TRF-${String(t.id).padStart(5, '0')} &nbsp;|&nbsp; ${tgl}</p>
<div class="grid">
  <div><div class="lbl">Dari Gudang</div><strong>${t.from_warehouse?.name ?? '?'}</strong></div>
  <div><div class="lbl">Ke Gudang</div><strong>${t.to_warehouse?.name ?? '?'}</strong></div>
  <div><div class="lbl">Pengantar</div><strong>${t.carrier?.full_name ?? '—'}</strong></div>
  <div><div class="lbl">Catatan</div><strong>${t.note ?? '—'}</strong></div>
</div>
<table>
  <thead><tr><th>No</th><th>Nama Barang</th><th>Satuan</th><th>Qty</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="signs">
  <div class="sign">Pengirim<div class="line">(................................)</div></div>
  <div class="sign">Penerima<div class="line">(................................)</div></div>
</div>
</body></html>`
}

// ── Custom dropdown (menggantikan native <select>) ─────────────────

type SelOpt = { value: string | number; label: string }

function CustomSelect({
  value, onChange, options, placeholder, disabled = false,
}: {
  value: string | number
  onChange: (v: string | number) => void
  options: SelOpt[]
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const selected = options.find(o => String(o.value) === String(value))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white border rounded-xl text-base transition-colors text-left ${
          open ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden max-h-56 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              onMouseDown={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 text-base border-b border-gray-100 last:border-0 transition-colors ${
                String(opt.value) === String(value)
                  ? 'bg-orange-50 text-orange-700 font-semibold'
                  : 'text-gray-900 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────

export default function TabTransfer({ user }: { user: User }) {
  const sb = createClient()

  const [view, setView] = useState<'list' | 'create'>('list')

  // List
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId]   = useState<number | null>(null)

  // Master data
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [profiles, setProfiles]     = useState<Profile[]>([])

  // Create form
  const [fromWh, setFromWh]       = useState<number | ''>('')
  const [toWh, setToWh]           = useState<number | ''>('')
  const [carrierId, setCarrierId] = useState<string>('')
  const [note, setNote]           = useState('')
  const [formItems, setFormItems] = useState<FormItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr]     = useState<string | null>(null)

  // Product picker
  const [prodSearch, setProdSearch]     = useState('')
  const [prodHits, setProdHits]         = useState<ProductHit[]>([])
  const [prodDropOpen, setProdDropOpen] = useState(false)
  const [pickedProd, setPickedProd]     = useState<ProductHit | null>(null)
  const [pickedUnit, setPickedUnit]     = useState<ProductHit['product_units'][0] | null>(null)
  const [pickedQty, setPickedQty]       = useState('')
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data loading ───────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: tData }, { data: wData }, { data: pData }] = await Promise.all([
      sb.from('transfers')
        .select(`
          id, from_wh, to_wh, status, carrier_id, note, created_at, received_at,
          from_warehouse:warehouses!from_wh(id, name),
          to_warehouse:warehouses!to_wh(id, name),
          carrier:profiles!carrier_id(id, full_name),
          creator:profiles!created_by(id, full_name),
          transfer_items(
            id, product_id, base_qty, qty_in_unit,
            unit:product_units!unit_id(id, unit_name),
            product:products(id, name, base_unit)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50),
      sb.from('warehouses').select('id, name').order('name'),
      sb.from('profiles').select('id, full_name').eq('active', true).order('full_name'),
    ])
    setTransfers((tData ?? []) as unknown as Transfer[])
    setWarehouses((wData ?? []) as Warehouse[])
    setProfiles((pData ?? []) as Profile[])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  // ── Product search ─────────────────────────────────────────────

  function onProdSearch(val: string) {
    setProdSearch(val)
    setProdDropOpen(true)
    setPickedProd(null); setPickedUnit(null); setPickedQty('')
    clearTimeout(debRef.current ?? undefined)
    if (!val.trim()) { setProdHits([]); setProdDropOpen(false); return }
    debRef.current = setTimeout(async () => {
      const { data } = await sb.from('products')
        .select('id, name, base_unit, product_units(id, unit_name, factor_to_base, is_default)')
        .ilike('name', `%${val.trim()}%`)
        .eq('active', true)
        .order('name').limit(8)
      setProdHits((data ?? []) as unknown as ProductHit[])
    }, 300)
  }

  function selectProd(hit: ProductHit) {
    setPickedProd(hit)
    setProdSearch(hit.name)
    setProdHits([]); setProdDropOpen(false)
    const def = hit.product_units.find(u => u.is_default) ?? hit.product_units[0] ?? null
    setPickedUnit(def)
    setPickedQty('')
  }

  function addItem() {
    if (!pickedProd || !pickedUnit || !pickedQty) return
    const qty = parseFloat(pickedQty)
    if (isNaN(qty) || qty <= 0) return
    const key = `${pickedProd.id}-${pickedUnit.id}-${Date.now()}`
    setFormItems(prev => [...prev, { key, product: pickedProd, unit: pickedUnit, qty }])
    setProdSearch(''); setPickedProd(null); setPickedUnit(null); setPickedQty('')
  }

  // ── Submit ─────────────────────────────────────────────────────

  async function submitTransfer() {
    if (!fromWh || !toWh || formItems.length === 0) return
    if (fromWh === toWh) { setFormErr('Gudang asal dan tujuan tidak boleh sama.'); return }

    setSubmitting(true); setFormErr(null)
    const items = formItems.map(i => ({
      product_id:  i.product.id,
      base_qty:    i.qty * i.unit.factor_to_base,
      unit_id:     i.unit.id,
      qty_in_unit: i.qty,
    }))

    const { error } = await sb.rpc('create_transfer', {
      p_from_wh:    fromWh,
      p_to_wh:      toWh,
      p_carrier_id: carrierId || null,
      p_created_by: user.id,
      p_note:       note.trim() || null,
      p_items:      items,
    })

    if (error) { setFormErr(error.message); setSubmitting(false); return }

    setFromWh(''); setToWh(''); setCarrierId(''); setNote('')
    setFormItems([])
    setSubmitting(false)
    setView('list')
    load()
  }



  // ── Print surat jalan ──────────────────────────────────────────

  function printSuratJalan(t: Transfer) {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(suratJalanHtml(t))
    w.document.close()
    w.focus()
    w.print()
  }

  // ── Render: Create form ────────────────────────────────────────

  if (view === 'create') {
    return (
      <div className="pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setView('list'); setFormErr(null) }}
            className="text-gray-500 hover:text-gray-900 text-sm transition-colors">
            ← Kembali
          </button>
          <p className="text-gray-900 font-bold text-base flex-1">Buat Transfer Stok</p>
        </div>

        {/* Rute: Dari → Ke */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Rute</p>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1.5">Dari Gudang</label>
              <CustomSelect
                value={fromWh}
                onChange={v => { setFromWh(Number(v)); setToWh('') }}
                options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                placeholder="Pilih gudang…"
              />
            </div>

            <div className="pb-2.5 text-gray-400 text-lg shrink-0">→</div>

            <div className="flex-1">
              <label className="block text-sm text-gray-500 mb-1.5">Ke Gudang</label>
              <CustomSelect
                value={toWh}
                onChange={v => setToWh(Number(v))}
                options={warehouses.filter(w => w.id !== fromWh).map(w => ({ value: w.id, label: w.name }))}
                placeholder="Pilih gudang…"
                disabled={!fromWh}
              />
            </div>
          </div>
        </div>

        {/* Pengantar + Catatan */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Detail</p>

          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Pengantar (karyawan)</label>
            <CustomSelect
              value={carrierId}
              onChange={v => setCarrierId(String(v))}
              options={profiles.map(p => ({ value: p.id, label: p.full_name }))}
              placeholder="Pilih karyawan…"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1.5">Catatan (opsional)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="cth: stok rutin mingguan"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
          </div>
        </div>

        {/* Product picker */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Tambah Barang</p>

          <div className="relative">
            <input type="text" value={prodSearch} onChange={e => onProdSearch(e.target.value)}
              onFocus={() => prodHits.length > 0 && setProdDropOpen(true)}
              onBlur={() => setTimeout(() => setProdDropOpen(false), 150)}
              placeholder="Cari nama produk…"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
            {prodDropOpen && prodHits.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {prodHits.map(h => (
                  <button key={h.id} onMouseDown={() => selectProd(h)}
                    className="w-full text-left px-3 py-2.5 hover:bg-orange-50 text-gray-900 text-base border-b border-gray-100 last:border-0 transition-colors">
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {pickedProd && pickedProd.product_units.length > 1 && (
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Pilih satuan</p>
              <div className="flex gap-2 flex-wrap">
                {pickedProd.product_units.map(u => (
                  <button key={u.id} onClick={() => { setPickedUnit(u); setPickedQty('') }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      pickedUnit?.id === u.id
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {u.unit_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {pickedProd && pickedUnit && (
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1.5">Jumlah ({pickedUnit.unit_name})</p>
                <input type="number" inputMode="decimal" value={pickedQty}
                  onChange={e => setPickedQty(e.target.value)} onFocus={e => e.target.select()}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  placeholder="0"
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
              <button onClick={addItem} disabled={!pickedQty || parseFloat(pickedQty) <= 0}
                className="mt-5 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 shrink-0">
                + Tambah
              </button>
            </div>
          )}
        </div>

        {/* Item list */}
        {formItems.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
              Daftar Barang — {formItems.length} item
            </p>
            <div className="divide-y divide-gray-100">
              {formItems.map(item => (
                <div key={item.key} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-gray-900 text-sm font-semibold truncate">{item.product.name}</p>
                    <p className="text-gray-500 text-sm">
                      {fmtQty(item.qty)} {item.unit.unit_name}
                      {item.unit.factor_to_base !== 1 && (
                        <span className="text-gray-400 ml-1.5">
                          = {fmtQty(item.qty * item.unit.factor_to_base)} {item.product.base_unit}
                        </span>
                      )}
                    </p>
                  </div>
                  <button onClick={() => setFormItems(prev => prev.filter(i => i.key !== item.key))}
                    className="text-gray-400 hover:text-red-600 text-sm transition-colors ml-4 shrink-0">
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {formErr && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm mb-3">
            {formErr}
          </div>
        )}

        <button
          onClick={submitTransfer}
          disabled={submitting || !fromWh || !toWh || formItems.length === 0}
          className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-40"
        >
          {submitting ? 'Menyimpan…' : 'Buat Transfer & Terbitkan Surat Jalan'}
        </button>
      </div>
    )
  }

  // ── Render: List ───────────────────────────────────────────────

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Transfer Stok</p>
        <button onClick={() => { setView('create'); setFormErr(null) }}
          className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
          + Transfer Baru
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
      ) : transfers.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-base">Belum ada transfer stok.</p>
      ) : (
        <div className="space-y-2">
          {transfers.map(t => {
            const isExpanded = expandedId === t.id
            const inTransit  = t.status === 'in_transit'
            return (
              <div key={t.id} className={`bg-white border rounded-2xl overflow-hidden ${
                inTransit ? 'border-amber-200' : 'border-gray-200'
              }`}>
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-gray-900 font-mono font-semibold text-sm">
                        TRF-{String(t.id).padStart(5, '0')}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                        inTransit
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {inTransit ? 'Dalam Perjalanan' : 'Diterima'}
                      </span>
                    </div>
                    <p className="text-gray-900 text-base font-medium">
                      {t.from_warehouse?.name ?? '?'} → {t.to_warehouse?.name ?? '?'}
                    </p>
                    <p className="text-gray-500 text-sm mt-0.5">
                      {fmtDateTime(t.created_at)}
                      {t.carrier && <> · {t.carrier.full_name}</>}
                      {t.note && <> · {t.note}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gray-900 text-sm font-semibold">{t.transfer_items.length} item</p>
                    <p className="text-gray-400 text-xs mt-0.5">{isExpanded ? '▲' : '▼'}</p>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                    <div className="space-y-1.5">
                      {t.transfer_items.map((item, i) => {
                        const unitName = item.unit?.unit_name ?? item.product?.base_unit ?? '?'
                        const qty      = item.qty_in_unit ?? item.base_qty
                        return (
                          <div key={item.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{item.product?.name ?? '?'}</span>
                            <span className="text-gray-900 font-semibold">
                              {fmtQty(qty)} {unitName}
                              {item.qty_in_unit && item.unit && item.unit.unit_name !== item.product?.base_unit && (
                                <span className="text-gray-400 font-normal ml-1">
                                  ({fmtQty(item.base_qty)} {item.product?.base_unit})
                                </span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => printSuratJalan(t)}
                        className="flex-1 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
                      >
                        Cetak Surat Jalan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
