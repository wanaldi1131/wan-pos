'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { DarkSelect } from '@/components/DarkSelect'

type UnitOption = { id: number; unit_name: string; factor_to_base: number }

type ProductHit = {
  id: number
  name: string
  product_units: UnitOption[]
}

type ItemRow = {
  rowId: string
  search: string
  productId: number | null
  productName: string
  hits: ProductHit[]
  dropOpen: boolean
  unitId: number | null
  unitOptions: UnitOption[]
  qty: string
}

type GrItem = {
  id: number
  qty: number
  base_qty: number
  product: { name: string; base_unit: string } | null
  unit: { unit_name: string } | null
}

type GrRecord = {
  id: number
  code: string
  received_at: string
  note: string | null
  supplier: { name: string } | null
  checker: { full_name: string } | null
  goods_receipt_items: GrItem[]
  purchase_invoices: { id: number }[]
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtQty = (n: number) =>
  Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 })

function newRow(): ItemRow {
  return {
    rowId: Math.random().toString(36).slice(2),
    search: '', productId: null, productName: '', hits: [], dropOpen: false,
    unitId: null, unitOptions: [], qty: '',
  }
}

export default function TabPenerimaan({ user }: { user: User }) {
  const sb = createClient()

  const [mode, setMode] = useState<'list' | 'create'>('list')

  const [grs, setGrs]               = useState<GrRecord[]>([])
  const [loadingGrs, setLoadingGrs] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [kasirList, setKasirList] = useState<{ id: string; full_name: string }[]>([])

  const [fSupplier, setFSupplier] = useState<number | null>(null)
  const [fChecker, setFChecker]   = useState<string>('')
  const [fDate, setFDate]         = useState('')
  const [fNote, setFNote]         = useState('')
  const [items, setItems]         = useState<ItemRow[]>([newRow()])
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState<string | null>(null)

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const loadGrs = useCallback(async () => {
    setLoadingGrs(true)
    const { data } = await sb.from('goods_receipts')
      .select(`
        id, code, received_at, note,
        supplier:suppliers!supplier_id(name),
        checker:profiles!checker_id(full_name),
        goods_receipt_items(
          id, qty, base_qty,
          product:products(name, base_unit),
          unit:product_units(unit_name)
        ),
        purchase_invoices(id)
      `)
      .order('created_at', { ascending: false })
      .limit(100)
    setGrs((data ?? []) as unknown as GrRecord[])
    setLoadingGrs(false)
  }, [sb])

  const loadRef = useCallback(async () => {
    const [{ data: sups }, { data: kasirs }] = await Promise.all([
      sb.from('suppliers').select('id, name').order('name'),
      sb.from('profiles').select('id, full_name').eq('role', 'kasir').eq('active', true).order('full_name'),
    ])
    setSuppliers(sups ?? [])
    setKasirList(kasirs ?? [])
  }, [sb])

  useEffect(() => {
    loadGrs()
    loadRef()
    setFDate(new Date().toISOString().split('T')[0])
  }, [loadGrs, loadRef])

  function updateRow(rowId: string, patch: Partial<ItemRow>) {
    setItems(prev => prev.map(r => r.rowId === rowId ? { ...r, ...patch } : r))
  }

  function onProductSearch(rowId: string, value: string) {
    updateRow(rowId, { search: value, dropOpen: true, productId: null, productName: '', unitId: null, unitOptions: [] })
    clearTimeout(debounceRefs.current[rowId])
    debounceRefs.current[rowId] = setTimeout(async () => {
      if (!value.trim()) { updateRow(rowId, { hits: [], dropOpen: false }); return }
      const { data } = await sb.from('products')
        .select('id, name, product_units(id, unit_name, factor_to_base)')
        .ilike('name', `%${value.trim()}%`)
        .eq('active', true)
        .order('name')
        .limit(8)
      updateRow(rowId, { hits: (data ?? []) as ProductHit[], dropOpen: true })
    }, 300)
  }

  function selectProduct(rowId: string, hit: ProductHit) {
    const units = hit.product_units ?? []
    updateRow(rowId, {
      search: hit.name, productId: hit.id, productName: hit.name,
      hits: [], dropOpen: false,
      unitOptions: units, unitId: units[0]?.id ?? null,
    })
  }

  async function submit() {
    setFormErr(null)
    if (!fSupplier) { setFormErr('Pilih supplier'); return }
    if (!fChecker)  { setFormErr('Pilih checker'); return }
    if (!fDate)     { setFormErr('Isi tanggal terima'); return }

    const validItems = items.filter(r => r.productId && r.unitId && parseFloat(r.qty) > 0)
    if (validItems.length === 0) { setFormErr('Minimal 1 barang dengan qty valid'); return }

    setSaving(true)
    const { error } = await sb.rpc('receive_goods', {
      p_supplier_id:  fSupplier,
      p_checker_id:   fChecker,
      p_warehouse_id: 1,
      p_received_at:  fDate,
      p_note:         fNote,
      p_created_by:   user.id,
      p_items:        validItems.map(r => ({ unit_id: r.unitId, qty: parseFloat(r.qty) })),
    })

    if (error) { setFormErr(error.message); setSaving(false); return }

    setMode('list')
    setFSupplier(null); setFChecker(''); setFNote('')
    setFDate(new Date().toISOString().split('T')[0])
    setItems([newRow()])
    loadGrs()
    setSaving(false)
  }

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Penerimaan Barang</p>
        {mode === 'list' ? (
          <button onClick={() => setMode('create')}
            className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
            + Buat GR
          </button>
        ) : (
          <button onClick={() => { setMode('list'); setFormErr(null) }}
            className="text-gray-500 hover:text-gray-900 text-sm transition-colors">
            Batal
          </button>
        )}
      </div>

      {mode === 'create' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
            <h2 className="text-gray-900 font-semibold text-base">Info Penerimaan</h2>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Supplier *</label>
              <DarkSelect
                value={fSupplier ? String(fSupplier) : ''}
                onChange={v => setFSupplier(v ? Number(v) : null)}
                options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
                placeholder="— Pilih supplier —"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Checker *</label>
              <DarkSelect
                value={fChecker}
                onChange={setFChecker}
                options={kasirList.map(k => ({ value: k.id, label: k.full_name }))}
                placeholder="— Pilih kasir —"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Tanggal Terima *</label>
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500" />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Catatan</label>
              <input type="text" value={fNote} onChange={e => setFNote(e.target.value)}
                placeholder="Opsional"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gray-900 font-semibold text-base">Detail Barang</h2>
              <button onClick={() => setItems(prev => [...prev, newRow()])}
                className="text-orange-400 hover:text-orange-600 text-sm transition-colors">
                + Tambah baris
              </button>
            </div>

            <div className="space-y-4">
              {items.map((row, idx) => (
                <div key={row.rowId} className="border border-gray-200 rounded-xl p-3 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">Barang {idx + 1}</span>
                    {items.length > 1 && (
                      <button onClick={() => setItems(prev => prev.filter(r => r.rowId !== row.rowId))}
                        className="text-gray-500 hover:text-red-600 text-sm transition-colors">
                        ✕ Hapus
                      </button>
                    )}
                  </div>

                  <div className="relative mb-2">
                    <input type="text" value={row.search}
                      onChange={e => onProductSearch(row.rowId, e.target.value)}
                      onFocus={() => row.hits.length > 0 && updateRow(row.rowId, { dropOpen: true })}
                      placeholder="Cari nama barang…"
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
                    {row.dropOpen && row.hits.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-md z-30 overflow-hidden">
                        {row.hits.map(hit => (
                          <button key={hit.id}
                            onMouseDown={e => { e.preventDefault(); selectProduct(row.rowId, hit) }}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-100 text-gray-900 text-base border-b border-gray-100 last:border-0">
                            {hit.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {row.productId && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <DarkSelect
                          value={row.unitId ? String(row.unitId) : ''}
                          onChange={v => updateRow(row.rowId, { unitId: Number(v) })}
                          options={row.unitOptions.map(u => ({ value: String(u.id), label: u.unit_name }))}
                        />
                      </div>
                      <input type="number" inputMode="decimal" min={0.01} step="any"
                        value={row.qty}
                        onChange={e => updateRow(row.rowId, { qty: e.target.value })}
                        onFocus={e => e.target.select()}
                        placeholder="Qty"
                        className="w-28 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {formErr && (
            <p className="text-red-600 text-base bg-red-50 rounded-xl px-4 py-2.5">{formErr}</p>
          )}
          <button onClick={submit} disabled={saving}
            className="w-full py-3.5 rounded-xl text-base font-bold bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40">
            {saving ? 'Menyimpan…' : '✓ Simpan Penerimaan'}
          </button>
        </div>
      )}

      {mode === 'list' && (
        <div className="space-y-3">
          {loadingGrs ? (
            <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
          ) : grs.length === 0 ? (
            <p className="text-center text-gray-500 py-12 text-base">Belum ada penerimaan barang.</p>
          ) : (
            grs.map(gr => {
              const isOpen = expandedId === gr.id
              return (
                <div key={gr.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <button onClick={() => setExpandedId(isOpen ? null : gr.id)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-900 text-base font-semibold">{gr.code}</span>
                        <span className="text-gray-500 text-sm">{fmtDate(gr.received_at)}</span>
                      </div>
                      <p className="text-gray-500 text-sm mt-0.5">
                        {gr.supplier?.name ?? '—'}
                        <span className="text-gray-500 mx-1.5">·</span>
                        Checker: {gr.checker?.full_name ?? '—'}
                      </p>
                      {gr.note && <p className="text-gray-500 text-sm mt-0.5 truncate">{gr.note}</p>}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-gray-500 text-sm">{gr.goods_receipt_items.length} item</span>
                      <span className="text-gray-500 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-200 px-4 py-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 uppercase tracking-wide">
                            <th className="text-left pb-2 font-medium">Barang</th>
                            <th className="text-right pb-2 font-medium">Qty</th>
                            <th className="text-right pb-2 font-medium w-20">Satuan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {gr.goods_receipt_items.map(item => (
                            <tr key={item.id}>
                              <td className="py-1.5 text-gray-400">{item.product?.name ?? '—'}</td>
                              <td className="py-1.5 text-right text-gray-900 font-medium">{fmtQty(item.qty)}</td>
                              <td className="py-1.5 text-right text-gray-500">{item.unit?.unit_name ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {gr.purchase_invoices.length === 0 && (
                        <div className="mt-3 flex justify-end">
                          <a href={`/purchase-invoice?mode=create&gr=${gr.id}`}
                            className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
                            Buat Invoice
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
