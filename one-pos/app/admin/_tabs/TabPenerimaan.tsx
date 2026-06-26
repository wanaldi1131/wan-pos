'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { DarkSelect } from '@/components/DarkSelect'

// ── Types ──────────────────────────────────────────────────────

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
  transfer_id: number | null
  supplier: { name: string } | null
  checker: { full_name: string } | null
  goods_receipt_items: GrItem[]
  purchase_invoices: { id: number }[]
}

type PTransferItem = {
  id: number
  product_id: number
  base_qty: number
  qty_in_unit: number | null
  unit: { id: number; unit_name: string; factor_to_base: number } | null
  product: { id: number; name: string; base_unit: string } | null
}

type PendingTransfer = {
  id: number
  note: string | null
  created_at: string
  from_warehouse: { id: number; name: string } | null
  to_warehouse: { id: number; name: string } | null
  carrier: { full_name: string } | null
  transfer_items: PTransferItem[]
}

type TFormItem = {
  rowId: string
  productId: number
  productName: string
  unitId: number
  unitName: string
  factor: number
  transferQty: number    // dalam satuan unit (display)
  transferBaseQty: number
  receivedQty: string    // input user
}

// ── Helpers ────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────

type Mode = 'list' | 'create' | 'transfer_pick' | 'transfer_form'

export default function TabPenerimaan({ user }: { user: User }) {
  const sb = createClient()

  const [mode, setMode] = useState<Mode>('list')

  // ── List GR ───────────────────────────────────────────────
  const [grs, setGrs]               = useState<GrRecord[]>([])
  const [loadingGrs, setLoadingGrs] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // ── Master data ───────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])
  const [kasirList, setKasirList] = useState<{ id: string; full_name: string }[]>([])

  // ── Form supplier (mode: create) ──────────────────────────
  const [fSupplier, setFSupplier] = useState<number | null>(null)
  const [fChecker, setFChecker]   = useState<string>('')
  const [fDate, setFDate]         = useState('')
  const [fNote, setFNote]         = useState('')
  const [items, setItems]         = useState<ItemRow[]>([newRow()])
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState<string | null>(null)

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Transfer pick (mode: transfer_pick) ───────────────────
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([])
  const [loadingTrf, setLoadingTrf]             = useState(false)

  // ── Form transfer (mode: transfer_form) ───────────────────
  const [selectedTransfer, setSelectedTransfer] = useState<PendingTransfer | null>(null)
  const [trfItems, setTrfItems]                 = useState<TFormItem[]>([])
  const [trfChecker, setTrfChecker]             = useState<string>('')
  const [trfDate, setTrfDate]                   = useState('')
  const [trfNote, setTrfNote]                   = useState('')
  const [trfSaving, setTrfSaving]               = useState(false)
  const [trfErr, setTrfErr]                     = useState<string | null>(null)

  // ── Data loading ──────────────────────────────────────────

  const loadGrs = useCallback(async () => {
    setLoadingGrs(true)
    const { data } = await sb.from('goods_receipts')
      .select(`
        id, code, received_at, note, transfer_id,
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
      sb.from('profiles').select('id, full_name').eq('active', true).order('full_name'),
    ])
    setSuppliers(sups ?? [])
    setKasirList(kasirs ?? [])
  }, [sb])

  const loadPendingTransfers = useCallback(async () => {
    setLoadingTrf(true)
    const { data } = await sb.from('transfers')
      .select(`
        id, note, created_at,
        from_warehouse:warehouses!from_wh(id, name),
        to_warehouse:warehouses!to_wh(id, name),
        carrier:profiles!carrier_id(id, full_name),
        transfer_items(
          id, product_id, base_qty, qty_in_unit,
          unit:product_units!unit_id(id, unit_name, factor_to_base),
          product:products(id, name, base_unit)
        )
      `)
      .eq('status', 'in_transit')
      .order('created_at', { ascending: false })
    setPendingTransfers((data ?? []) as unknown as PendingTransfer[])
    setLoadingTrf(false)
  }, [sb])

  useEffect(() => {
    loadGrs()
    loadRef()
    setFDate(new Date().toISOString().split('T')[0])
  }, [loadGrs, loadRef])

  // ── Supplier form helpers ─────────────────────────────────

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

  async function submitSupplier() {
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
    setMode('list'); resetSupplierForm(); loadGrs()
    setSaving(false)
  }

  function resetSupplierForm() {
    setFSupplier(null); setFChecker(''); setFNote('')
    setFDate(new Date().toISOString().split('T')[0])
    setItems([newRow()])
  }

  // ── Transfer form helpers ─────────────────────────────────

  function openTransferPick() {
    setMode('transfer_pick')
    loadPendingTransfers()
  }

  function selectTransfer(t: PendingTransfer) {
    setSelectedTransfer(t)
    setTrfDate(new Date().toISOString().split('T')[0])
    setTrfNote('')
    setTrfChecker('')
    setTrfErr(null)

    const mapped: TFormItem[] = t.transfer_items.map(ti => ({
      rowId: String(ti.id),
      productId: ti.product_id,
      productName: ti.product?.name ?? '?',
      unitId: ti.unit?.id ?? 0,
      unitName: ti.unit?.unit_name ?? ti.product?.base_unit ?? '?',
      factor: ti.unit?.factor_to_base ?? 1,
      transferQty: ti.qty_in_unit ?? (ti.unit?.factor_to_base ? ti.base_qty / ti.unit.factor_to_base : ti.base_qty),
      transferBaseQty: ti.base_qty,
      receivedQty: '',  // kosong, user isi sendiri
    }))
    setTrfItems(mapped)
    setMode('transfer_form')
  }

  async function submitTransferReceipt() {
    setTrfErr(null)
    if (!trfChecker) { setTrfErr('Pilih checker'); return }
    if (!trfDate)    { setTrfErr('Isi tanggal terima'); return }
    if (!selectedTransfer) return

    // Semua item wajib diisi (boleh 0 jika tidak diterima)
    const hasBlank = trfItems.some(i => i.receivedQty === '')
    if (hasBlank) { setTrfErr('Isi qty semua barang (0 jika tidak diterima)'); return }

    setTrfSaving(true)
    const { error } = await sb.rpc('receive_transfer_with_gr', {
      p_transfer_id: selectedTransfer.id,
      p_checker_id:  trfChecker,
      p_received_at: trfDate,
      p_note:        trfNote.trim() || null,
      p_created_by:  user.id,
      p_items: trfItems.map(i => ({
        product_id: i.productId,
        unit_id:    i.unitId,
        qty:        parseFloat(i.receivedQty) || 0,
      })),
    })

    if (error) { setTrfErr(error.message); setTrfSaving(false); return }
    setMode('list')
    setSelectedTransfer(null)
    loadGrs()
    setTrfSaving(false)
  }

  // ── Render: mode list ─────────────────────────────────────

  if (mode === 'list') return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Penerimaan Barang</p>
        <div className="flex gap-2">
          <button onClick={openTransferPick}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
            Terima Transfer
          </button>
          <button onClick={() => setMode('create')}
            className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
            + Buat GR
          </button>
        </div>
      </div>

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
                      {gr.transfer_id && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">
                          dari transfer
                        </span>
                      )}
                      <span className="text-gray-500 text-sm">{fmtDate(gr.received_at)}</span>
                    </div>
                    <p className="text-gray-500 text-sm mt-0.5">
                      {gr.supplier?.name ?? (gr.transfer_id ? `Transfer #TRF-${String(gr.transfer_id).padStart(5,'0')}` : '—')}
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
                            <td className="py-1.5 text-gray-700">{item.product?.name ?? '—'}</td>
                            <td className="py-1.5 text-right text-gray-900 font-medium">{fmtQty(item.qty)}</td>
                            <td className="py-1.5 text-right text-gray-500">{item.unit?.unit_name ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!gr.transfer_id && gr.purchase_invoices.length === 0 && (
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
    </div>
  )

  // ── Render: pilih transfer ─────────────────────────────────

  if (mode === 'transfer_pick') return (
    <div className="pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setMode('list')}
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors">← Kembali</button>
        <p className="text-gray-900 font-bold text-base flex-1">Pilih Transfer yang Diterima</p>
      </div>

      {loadingTrf ? (
        <p className="text-center text-gray-500 py-12">Memuat…</p>
      ) : pendingTransfers.length === 0 ? (
        <p className="text-center text-gray-500 py-12">Tidak ada transfer yang sedang dalam perjalanan.</p>
      ) : (
        <div className="space-y-2">
          {pendingTransfers.map(t => (
            <button key={t.id} onClick={() => selectTransfer(t)}
              className="w-full bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl px-4 py-3 text-left transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-semibold text-sm text-gray-900">
                  TRF-{String(t.id).padStart(5, '0')}
                </span>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">
                  dalam perjalanan
                </span>
              </div>
              <p className="text-gray-900 text-base font-medium">
                {t.from_warehouse?.name ?? '?'} → {t.to_warehouse?.name ?? '?'}
              </p>
              <p className="text-gray-500 text-sm mt-0.5">
                {new Date(t.created_at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })}
                {t.carrier && <> · {t.carrier.full_name}</>}
                {t.note && <> · {t.note}</>}
                <> · {t.transfer_items.length} item</>
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ── Render: form terima transfer ───────────────────────────

  if (mode === 'transfer_form' && selectedTransfer) return (
    <div className="pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setMode('transfer_pick')}
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors">← Kembali</button>
        <p className="text-gray-900 font-bold text-base flex-1">
          Terima Transfer TRF-{String(selectedTransfer.id).padStart(5, '0')}
        </p>
      </div>

      {/* Info transfer */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-3 text-sm text-blue-800">
        <span className="font-semibold">{selectedTransfer.from_warehouse?.name}</span>
        {' → '}
        <span className="font-semibold">{selectedTransfer.to_warehouse?.name}</span>
        {selectedTransfer.carrier && <> · Pengantar: {selectedTransfer.carrier.full_name}</>}
      </div>

      {/* Checker + tanggal */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 space-y-3">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Checker *</label>
          <DarkSelect
            value={trfChecker}
            onChange={setTrfChecker}
            options={kasirList.map(k => ({ value: k.id, label: k.full_name }))}
            placeholder="— Pilih penerima —"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Tanggal Terima *</label>
          <input type="date" value={trfDate} onChange={e => setTrfDate(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Catatan</label>
          <input type="text" value={trfNote} onChange={e => setTrfNote(e.target.value)}
            placeholder="Opsional"
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
        </div>
      </div>

      {/* Tabel item — isi qty diterima */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
        <p className="text-gray-900 font-semibold text-base mb-3">
          Detail Barang
          <span className="text-gray-400 font-normal text-sm ml-2">— isi qty aktual yang diterima (0 jika tidak ada)</span>
        </p>
        <div className="space-y-3">
          {trfItems.map((item, idx) => {
            const received = parseFloat(item.receivedQty)
            const hasDiff  = item.receivedQty !== '' && !isNaN(received) && Math.abs(received - item.transferQty) > 0.0001
            return (
              <div key={item.rowId} className={`border rounded-xl p-3 ${hasDiff ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-900 text-sm font-semibold">{item.productName}</span>
                  {hasDiff && (
                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-md">
                      selisih {fmtQty(Math.abs(received - item.transferQty))} {item.unitName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-1">Dikirim</p>
                    <p className="text-gray-600 text-sm font-medium">
                      {fmtQty(item.transferQty)} {item.unitName}
                    </p>
                  </div>
                  <div className="text-gray-300">→</div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-1">Diterima *</p>
                    <input
                      type="number" inputMode="decimal" min={0} step="any"
                      value={item.receivedQty}
                      onChange={e => setTrfItems(prev => prev.map((r, i) =>
                        i === idx ? { ...r, receivedQty: e.target.value } : r
                      ))}
                      onFocus={e => e.target.select()}
                      placeholder={fmtQty(item.transferQty)}
                      className={`w-full border rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        hasDiff ? 'border-red-300 bg-white' : 'border-gray-200 bg-white'
                      }`}
                    />
                  </div>
                  <div className="text-gray-500 text-sm w-16 shrink-0">{item.unitName}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {trfErr && (
        <p className="text-red-600 text-base bg-red-50 rounded-xl px-4 py-2.5 mb-3">{trfErr}</p>
      )}

      <button onClick={submitTransferReceipt} disabled={trfSaving}
        className="w-full py-3.5 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40">
        {trfSaving ? 'Menyimpan…' : '✓ Simpan Penerimaan Transfer'}
      </button>
    </div>
  )

  // ── Render: form supplier (mode: create) ───────────────────

  return (
    <div className="pb-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => { setMode('list'); setFormErr(null) }}
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors">← Kembali</button>
        <p className="text-gray-900 font-bold text-base flex-1">Buat GR dari Supplier</p>
      </div>

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
                      className="text-gray-500 hover:text-red-600 text-sm transition-colors">✕ Hapus</button>
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
        <button onClick={submitSupplier} disabled={saving}
          className="w-full py-3.5 rounded-xl text-base font-bold bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40">
          {saving ? 'Menyimpan…' : '✓ Simpan Penerimaan'}
        </button>
      </div>
    </div>
  )
}
