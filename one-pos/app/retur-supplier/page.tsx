'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DarkSelect } from '@/components/DarkSelect'

// ── Types ──────────────────────────────────────────────────────
type UnitOption = { id: number; unit_name: string; factor_to_base: number }

type SupplierProduct = {
  product_id: number
  product_name: string
  units: UnitOption[]
}

type ReturnItemRow = {
  rowId: string
  productId: number | null
  unitId: number | null
  unitOptions: UnitOption[]
  qty: string
  reason: string
}

type SrItem = {
  id: number
  qty: number
  reason: string | null
  product: { name: string } | null
  unit: { unit_name: string } | null
}

type SrRecord = {
  id: number
  code: string
  returned_at: string
  note: string | null
  supplier: { name: string } | null
  supplier_return_items: SrItem[]
}

// ── Helpers ────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtQty = (n: number) =>
  Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 })

function newRow(): ReturnItemRow {
  return {
    rowId: Math.random().toString(36).slice(2),
    productId: null, unitId: null, unitOptions: [], qty: '', reason: '',
  }
}

// ── Page ───────────────────────────────────────────────────────
export default function ReturSupplierPage() {
  const sb = createClient()

  const [userId, setUserId]     = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [mode, setMode] = useState<'list' | 'create'>('list')

  // SR list
  const [srs, setSrs]             = useState<SrRecord[]>([])
  const [loadingSrs, setLoadingSrs] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Reference data
  const [suppliers, setSuppliers]   = useState<{ id: number; name: string }[]>([])
  // Products pernah diterima dari supplier terpilih
  const [supplierProds, setSupplierProds] = useState<SupplierProduct[]>([])
  const [loadingProds, setLoadingProds]   = useState(false)

  // Form header
  const [fSupplier, setFSupplier] = useState<number | null>(null)
  const [fDate, setFDate]         = useState('')
  const [fNote, setFNote]         = useState('')

  // Form items
  const [items, setItems] = useState<ReturnItemRow[]>([newRow()])

  // Submit
  const [saving, setSaving]   = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUserId(data.user.id)
      sb.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: p }) => {
          const role = p?.role ?? null
          setUserRole(role)
          setLoadingUser(false)
          if (role !== 'admin' && role !== 'owner') window.location.href = '/admin'
        })
    })
  }, [])

  // ── Load SR list ──────────────────────────────────────────
  const loadSrs = useCallback(async () => {
    setLoadingSrs(true)
    const { data } = await sb.from('supplier_returns')
      .select(`
        id, code, returned_at, note,
        supplier:suppliers(name),
        supplier_return_items(
          id, qty, reason,
          product:products(name),
          unit:product_units(unit_name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100)
    setSrs((data ?? []) as unknown as SrRecord[])
    setLoadingSrs(false)
  }, [sb])

  // ── Load suppliers ────────────────────────────────────────
  const loadSuppliers = useCallback(async () => {
    const { data } = await sb.from('suppliers').select('id, name').order('name')
    setSuppliers(data ?? [])
  }, [sb])

  useEffect(() => {
    if (!loadingUser && (userRole === 'admin' || userRole === 'owner')) {
      loadSrs()
      loadSuppliers()
      setFDate(new Date().toISOString().split('T')[0])
    }
  }, [loadingUser])

  // ── Load produk pernah diterima dari supplier ─────────────
  async function loadSupplierProducts(supplierId: number) {
    setLoadingProds(true)
    setSupplierProds([])
    setItems([newRow()])

    // Query: distinct produk dari GR supplier ini, beserta semua satuannya
    const { data: grItems } = await sb
      .from('goods_receipt_items')
      .select(`
        product_id,
        product:products(id, name),
        goods_receipt:goods_receipts!inner(supplier_id)
      `)
      .eq('goods_receipts.supplier_id', supplierId)

    if (!grItems || grItems.length === 0) {
      setLoadingProds(false)
      return
    }

    // Kumpulkan distinct product_id
    const productIds = [...new Set(grItems.map((r: any) => r.product_id as number))]

    // Fetch units per product
    const { data: units } = await sb
      .from('product_units')
      .select('id, product_id, unit_name, factor_to_base')
      .in('product_id', productIds)
      .order('is_default', { ascending: false })

    // Build SupplierProduct list
    const prodMap = new Map<number, SupplierProduct>()
    for (const row of grItems as any[]) {
      const pid = row.product_id as number
      if (!prodMap.has(pid)) {
        prodMap.set(pid, {
          product_id: pid,
          product_name: row.product?.name ?? '—',
          units: [],
        })
      }
    }
    for (const u of units as any[]) {
      const entry = prodMap.get(u.product_id)
      if (entry) entry.units.push({ id: u.id, unit_name: u.unit_name, factor_to_base: u.factor_to_base })
    }

    setSupplierProds([...prodMap.values()].sort((a, b) => a.product_name.localeCompare(b.product_name)))
    setLoadingProds(false)
  }

  // ── Item row helpers ──────────────────────────────────────
  function updateRow(rowId: string, patch: Partial<ReturnItemRow>) {
    setItems(prev => prev.map(r => r.rowId === rowId ? { ...r, ...patch } : r))
  }

  function selectProduct(rowId: string, prod: SupplierProduct) {
    updateRow(rowId, {
      productId: prod.product_id,
      unitOptions: prod.units,
      unitId: prod.units[0]?.id ?? null,
    })
  }

  function addRow() {
    setItems(prev => [...prev, newRow()])
  }

  function removeRow(rowId: string) {
    setItems(prev => prev.filter(r => r.rowId !== rowId))
  }

  // ── Submit ────────────────────────────────────────────────
  async function submit() {
    setFormErr(null)
    if (!fSupplier) { setFormErr('Pilih supplier'); return }
    if (!fDate)     { setFormErr('Isi tanggal retur'); return }

    const validItems = items.filter(r => r.productId && r.unitId && parseFloat(r.qty) > 0)
    if (validItems.length === 0) {
      setFormErr('Minimal 1 barang dengan qty valid')
      return
    }

    setSaving(true)
    const { data, error } = await sb.rpc('return_to_supplier', {
      p_supplier_id:  fSupplier,
      p_warehouse_id: 1,
      p_returned_at:  fDate,
      p_note:         fNote,
      p_created_by:   userId,
      p_items: validItems.map(r => ({
        unit_id: r.unitId,
        qty:     parseFloat(r.qty),
        reason:  r.reason.trim() || null,
      })),
    })

    if (error) {
      setFormErr(error.message)
      setSaving(false)
      return
    }

    setMode('list')
    setFSupplier(null); setFNote(''); setSupplierProds([])
    setFDate(new Date().toISOString().split('T')[0])
    setItems([newRow()])
    loadSrs()
    setSaving(false)
  }

  // ── Render ─────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <span className="text-gray-500 text-sm">Memuat…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <a href="/admin" className="text-gray-500 hover:text-white transition-colors text-sm">← Admin</a>
        <span className="text-white/15">|</span>
        <h1 className="text-white font-semibold text-sm">Retur ke Supplier</h1>
        <div className="flex-1" />
        {mode === 'list' ? (
          <button
            onClick={() => setMode('create')}
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + Buat SR
          </button>
        ) : (
          <button
            onClick={() => { setMode('list'); setFormErr(null) }}
            className="text-gray-500 hover:text-white text-sm transition-colors"
          >
            Batal
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">

        {/* ── Form buat SR ──────────────────────────────────── */}
        {mode === 'create' && (
          <div className="space-y-4">

            {/* Header */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4 space-y-3">
              <h2 className="text-white font-semibold text-sm">Info Retur</h2>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Supplier *</label>
                <DarkSelect
                  value={fSupplier ? String(fSupplier) : ''}
                  onChange={v => {
                    const id = v ? Number(v) : null
                    setFSupplier(id)
                    if (id) loadSupplierProducts(id)
                    else { setSupplierProds([]); setItems([newRow()]) }
                  }}
                  options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
                  placeholder="— Pilih supplier —"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Tanggal Retur *</label>
                <input
                  type="date"
                  value={fDate}
                  onChange={e => setFDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Catatan</label>
                <input
                  type="text"
                  value={fNote}
                  onChange={e => setFNote(e.target.value)}
                  placeholder="Opsional"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Items */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">Barang Diretur</h2>
                {fSupplier && (
                  <button
                    onClick={addRow}
                    className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors"
                  >
                    + Tambah baris
                  </button>
                )}
              </div>

              {!fSupplier ? (
                <p className="text-gray-600 text-sm py-2">Pilih supplier dulu untuk melihat daftar barang.</p>
              ) : loadingProds ? (
                <p className="text-gray-600 text-sm py-2">Memuat daftar barang…</p>
              ) : supplierProds.length === 0 ? (
                <p className="text-gray-600 text-sm py-2">Belum ada barang yang pernah diterima dari supplier ini.</p>
              ) : (
                <div className="space-y-4">
                  {items.map((row, idx) => (
                    <div key={row.rowId} className="border border-white/8 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-600 text-xs">Barang {idx + 1}</span>
                        {items.length > 1 && (
                          <button
                            onClick={() => removeRow(row.rowId)}
                            className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                          >
                            ✕ Hapus
                          </button>
                        )}
                      </div>

                      {/* Product select */}
                      <div className="mb-2">
                        <DarkSelect
                          value={row.productId ? String(row.productId) : ''}
                          onChange={v => {
                            const prod = supplierProds.find(p => p.product_id === Number(v))
                            if (prod) selectProduct(row.rowId, prod)
                            else updateRow(row.rowId, { productId: null, unitId: null, unitOptions: [] })
                          }}
                          options={supplierProds.map(p => ({ value: String(p.product_id), label: p.product_name }))}
                          placeholder="— Pilih barang —"
                        />
                      </div>

                      {/* Unit + Qty */}
                      {row.productId && (
                        <div className="flex gap-2 mb-2">
                          <div className="flex-1">
                            <DarkSelect
                              value={row.unitId ? String(row.unitId) : ''}
                              onChange={v => updateRow(row.rowId, { unitId: Number(v) })}
                              options={row.unitOptions.map(u => ({ value: String(u.id), label: u.unit_name }))}
                            />
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0.01}
                            step="any"
                            value={row.qty}
                            onChange={e => updateRow(row.rowId, { qty: e.target.value })}
                            onFocus={e => e.target.select()}
                            placeholder="Qty"
                            className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>
                      )}

                      {/* Alasan retur */}
                      {row.productId && (
                        <input
                          type="text"
                          value={row.reason}
                          onChange={e => updateRow(row.rowId, { reason: e.target.value })}
                          placeholder="Alasan retur (opsional)"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {formErr && (
              <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-2.5">{formErr}</p>
            )}
            <button
              onClick={submit}
              disabled={saving || !fSupplier || supplierProds.length === 0}
              className="w-full py-3.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
            >
              {saving ? 'Menyimpan…' : '✓ Simpan Retur'}
            </button>
          </div>
        )}

        {/* ── List SR ───────────────────────────────────────── */}
        {mode === 'list' && (
          <div className="space-y-3">
            {loadingSrs ? (
              <p className="text-center text-gray-600 py-12 text-sm">Memuat…</p>
            ) : srs.length === 0 ? (
              <p className="text-center text-gray-600 py-12 text-sm">Belum ada retur ke supplier.</p>
            ) : (
              srs.map(sr => {
                const isOpen = expandedId === sr.id
                return (
                  <div key={sr.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isOpen ? null : sr.id)}
                      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-semibold">{sr.code}</span>
                          <span className="text-gray-600 text-xs">{fmtDate(sr.returned_at)}</span>
                        </div>
                        <p className="text-gray-400 text-xs mt-0.5">{sr.supplier?.name ?? '—'}</p>
                        {sr.note && <p className="text-gray-600 text-xs mt-0.5 truncate">{sr.note}</p>}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className="text-gray-500 text-xs">{sr.supplier_return_items.length} item</span>
                        <span className="text-gray-600 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/8 px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-600 uppercase tracking-wide">
                              <th className="text-left pb-2 font-medium">Barang</th>
                              <th className="text-right pb-2 font-medium">Qty</th>
                              <th className="text-right pb-2 font-medium w-16">Satuan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {sr.supplier_return_items.map(item => (
                              <tr key={item.id}>
                                <td className="py-1.5">
                                  <span className="text-gray-300">{item.product?.name ?? '—'}</span>
                                  {item.reason && (
                                    <span className="text-gray-600 ml-1.5">· {item.reason}</span>
                                  )}
                                </td>
                                <td className="py-1.5 text-right text-white font-medium">{fmtQty(item.qty)}</td>
                                <td className="py-1.5 text-right text-gray-500">{item.unit?.unit_name ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
