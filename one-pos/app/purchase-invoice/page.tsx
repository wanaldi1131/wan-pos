'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DarkSelect } from '@/components/DarkSelect'

// ── Types ──────────────────────────────────────────────────────
type UnitOption = { id: number; unit_name: string }

type ProductHit = {
  id: number
  name: string
  product_units: UnitOption[]
}

type InvoiceItemRow = {
  rowId: string
  fromGr: boolean
  productId: number | null
  productName: string
  unitId: number | null
  unitName: string
  unitOptions: UnitOption[]
  qtyStr: string
  unitPriceStr: string
  discountStr: string
  discountType: 'percent' | 'amount'
  totalStr: string
  // product search (non-GR rows)
  search: string
  hits: ProductHit[]
  dropOpen: boolean
}

type PiLineItem = {
  id: number
  qty: number
  unit_price: number
  discount_str: string | null
  discount_type: string
  discount_amount: number
  subtotal: number
  total: number
  product: { name: string } | null
  unit: { unit_name: string } | null
}

type PiRecord = {
  id: number
  code: string
  invoice_date: string
  due_date: string | null
  note: string | null
  subtotal: number
  discount_amount: number
  total: number
  supplier: { name: string } | null
  gr: { code: string } | null
  purchase_invoice_items: PiLineItem[]
}

// ── Helpers ────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtRp = (n: number) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID')

// Strip titik ribuan (30.000 → 30000), lalu parse
const parseNum = (s: string) => parseFloat(s.replace(/\./g, '').replace(/,/g, '')) || 0

const fmtInput = (n: number): string =>
  n <= 0 ? '' : Math.round(n).toLocaleString('id-ID')

function calcNetFactor(discStr: string): number {
  const parts = discStr.split('+').map(p => parseFloat(p.trim())).filter(n => !isNaN(n) && n > 0 && n < 100)
  return parts.reduce((acc, pct) => acc * (1 - pct / 100), 1)
}

function calcDiscountAmount(subtotal: number, discStr: string, discType: 'percent' | 'amount'): number {
  const s = discStr.trim()
  if (!s) return 0
  if (discType === 'amount') return Math.min(parseNum(s), subtotal)
  return Math.round(subtotal * (1 - calcNetFactor(s)) * 100) / 100
}

function backCalcUnitPrice(total: number, qty: number, discStr: string, discType: 'percent' | 'amount'): number {
  if (qty <= 0) return 0
  if (discType === 'amount') return (total + parseNum(discStr.trim())) / qty
  const f = calcNetFactor(discStr)
  return f > 0 ? total / (qty * f) : 0
}

function recomputeTotal(row: InvoiceItemRow): string {
  if (!row.unitPriceStr.trim()) return ''
  const qty = parseNum(row.qtyStr)
  const sub = qty * parseNum(row.unitPriceStr)
  const disc = calcDiscountAmount(sub, row.discountStr, row.discountType)
  const tot = Math.max(0, sub - disc)
  return fmtInput(tot)
}

function recomputePrice(totalStr: string, row: InvoiceItemRow): string {
  if (!totalStr.trim()) return ''
  const qty = parseNum(row.qtyStr)
  const price = backCalcUnitPrice(parseNum(totalStr), qty, row.discountStr, row.discountType)
  return fmtInput(price)
}

function newEmptyRow(): InvoiceItemRow {
  return {
    rowId: Math.random().toString(36).slice(2),
    fromGr: false,
    productId: null, productName: '', unitId: null, unitName: '', unitOptions: [],
    qtyStr: '1',
    unitPriceStr: '', discountStr: '', discountType: 'percent', totalStr: '',
    search: '', hits: [], dropOpen: false,
  }
}

// ── Page export (wraps inner in Suspense for useSearchParams) ──
export default function PurchaseInvoicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <span className="text-gray-500 text-sm">Memuat…</span>
      </div>
    }>
      <PurchaseInvoiceInner />
    </Suspense>
  )
}

// ── Inner component ───────────────────────────────────────────
function PurchaseInvoiceInner() {
  const sb = createClient()
  const searchParams = useSearchParams()
  const grParam  = searchParams.get('gr')
  const modeParam = searchParams.get('mode')

  const [userId, setUserId]         = useState<string | null>(null)
  const [userRole, setUserRole]     = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [mode, setMode] = useState<'list' | 'create'>(modeParam === 'create' ? 'create' : 'list')

  // List
  const [pis, setPis]               = useState<PiRecord[]>([])
  const [loadingPis, setLoadingPis] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Reference data
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])

  // Form
  const [fSupplier, setFSupplier] = useState<number | null>(null)
  const [grRef, setGrRef]         = useState<{ id: number; code: string } | null>(null)
  const [fDate, setFDate]         = useState('')
  const [fDueDate, setFDueDate]   = useState('')
  const [fNote, setFNote]         = useState('')
  const [items, setItems]         = useState<InvoiceItemRow[]>([newEmptyRow()])
  const [saving, setSaving]       = useState(false)
  const [formErr, setFormErr]     = useState<string | null>(null)
  const [loadingGr, setLoadingGr] = useState(false)

  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Auth ────────────────────────────────────────────────────
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

  // ── Load PI list ─────────────────────────────────────────────
  const loadPis = useCallback(async () => {
    setLoadingPis(true)
    const { data } = await sb.from('purchase_invoices')
      .select(`
        id, code, invoice_date, due_date, note,
        subtotal, discount_amount, total,
        supplier:suppliers!supplier_id(name),
        gr:goods_receipts!goods_receipt_id(code),
        purchase_invoice_items(
          id, qty, unit_price, discount_str, discount_type, discount_amount, subtotal, total,
          product:products(name),
          unit:product_units(unit_name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100)
    setPis((data ?? []) as unknown as PiRecord[])
    setLoadingPis(false)
  }, [sb])

  // ── Load reference data ──────────────────────────────────────
  const loadRef = useCallback(async () => {
    const { data } = await sb.from('suppliers').select('id, name').order('name')
    setSuppliers(data ?? [])
  }, [sb])

  useEffect(() => {
    if (!loadingUser && (userRole === 'admin' || userRole === 'owner')) {
      loadPis()
      loadRef()
      setFDate(new Date().toISOString().split('T')[0])
    }
  }, [loadingUser])

  // ── Pre-fill dari GR ─────────────────────────────────────────
  useEffect(() => {
    if (!grParam || loadingUser || (userRole !== 'admin' && userRole !== 'owner')) return
    setLoadingGr(true)
    sb.from('goods_receipts')
      .select(`
        id, code, supplier_id,
        goods_receipt_items(
          id, qty,
          product:products(id, name),
          unit:product_units(id, unit_name)
        )
      `)
      .eq('id', grParam)
      .single()
      .then(({ data: gr }) => {
        if (!gr) { setLoadingGr(false); return }
        setFSupplier((gr as any).supplier_id)
        setGrRef({ id: (gr as any).id, code: (gr as any).code })
        const rows: InvoiceItemRow[] = ((gr as any).goods_receipt_items ?? []).map((item: any) => ({
          rowId: Math.random().toString(36).slice(2),
          fromGr: true,
          productId: item.product?.id ?? null,
          productName: item.product?.name ?? '',
          unitId: item.unit?.id ?? null,
          unitName: item.unit?.unit_name ?? '',
          unitOptions: item.unit ? [{ id: item.unit.id, unit_name: item.unit.unit_name }] : [],
          qtyStr: String(item.qty),
          unitPriceStr: '', discountStr: '', discountType: 'percent', totalStr: '',
          search: item.product?.name ?? '', hits: [], dropOpen: false,
        }))
        setItems(rows.length > 0 ? rows : [newEmptyRow()])
        setLoadingGr(false)
      })
  }, [grParam, loadingUser, userRole])

  // ── Item row state helpers ────────────────────────────────────
  function updateRow(rowId: string, patch: Partial<InvoiceItemRow>) {
    setItems(prev => prev.map(r => r.rowId === rowId ? { ...r, ...patch } : r))
  }

  function onUnitPriceChange(rowId: string, val: string) {
    setItems(prev => prev.map(r => {
      if (r.rowId !== rowId) return r
      const next = { ...r, unitPriceStr: val }
      return { ...next, totalStr: recomputeTotal(next) }
    }))
  }

  function onDiscountChange(rowId: string, val: string) {
    setItems(prev => prev.map(r => {
      if (r.rowId !== rowId) return r
      const next = { ...r, discountStr: val }
      return { ...next, totalStr: recomputeTotal(next) }
    }))
  }

  function onDiscountTypeToggle(rowId: string) {
    setItems(prev => prev.map(r => {
      if (r.rowId !== rowId) return r
      const next = { ...r, discountType: (r.discountType === 'percent' ? 'amount' : 'percent') as 'percent' | 'amount', discountStr: '' }
      return { ...next, totalStr: recomputeTotal(next) }
    }))
  }

  function onTotalChange(rowId: string, val: string) {
    setItems(prev => prev.map(r => {
      if (r.rowId !== rowId) return r
      const priceStr = recomputePrice(val, r)
      return { ...r, totalStr: val, unitPriceStr: val === '' ? '' : priceStr }
    }))
  }

  function onQtyChange(rowId: string, val: string) {
    setItems(prev => prev.map(r => {
      if (r.rowId !== rowId) return r
      const next = { ...r, qtyStr: val }
      return { ...next, totalStr: recomputeTotal(next) }
    }))
  }

  function onProductSearch(rowId: string, value: string) {
    updateRow(rowId, { search: value, dropOpen: true, productId: null, productName: '', unitId: null, unitOptions: [] })
    clearTimeout(debounceRefs.current[rowId])
    debounceRefs.current[rowId] = setTimeout(async () => {
      if (!value.trim()) { updateRow(rowId, { hits: [], dropOpen: false }); return }
      const { data } = await sb.from('products')
        .select('id, name, product_units(id, unit_name)')
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
      unitOptions: units, unitId: units[0]?.id ?? null, unitName: units[0]?.unit_name ?? '',
    })
  }

  function addRow() { setItems(prev => [...prev, newEmptyRow()]) }
  function removeRow(rowId: string) { setItems(prev => prev.filter(r => r.rowId !== rowId)) }

  // ── Grand totals (computed from first principles) ─────────────
  const grandRows = items.map(r => {
    const qty = parseNum(r.qtyStr)
    const sub = qty * parseNum(r.unitPriceStr)
    const disc = calcDiscountAmount(sub, r.discountStr, r.discountType)
    return { sub, disc, tot: Math.max(0, sub - disc) }
  })
  const grandSubtotal = grandRows.reduce((a, r) => a + r.sub, 0)
  const grandDiscount = grandRows.reduce((a, r) => a + r.disc, 0)
  const grandTotal    = grandRows.reduce((a, r) => a + r.tot, 0)

  // ── Submit ───────────────────────────────────────────────────
  async function submit() {
    setFormErr(null)
    if (!fSupplier) { setFormErr('Pilih supplier'); return }
    if (!fDate)     { setFormErr('Isi tanggal invoice'); return }

    const validItems = items.filter(r => r.productId && r.unitId && parseNum(r.qtyStr) > 0)
    if (validItems.length === 0) {
      setFormErr('Minimal 1 barang dengan data lengkap')
      return
    }

    setSaving(true)
    const { error } = await sb.rpc('save_purchase_invoice', {
      p_supplier_id:      fSupplier,
      p_goods_receipt_id: grRef?.id ?? null,
      p_invoice_date:     fDate,
      p_due_date:         fDueDate || null,
      p_note:             fNote,
      p_created_by:       userId,
      p_items: validItems.map(r => {
        const qty      = parseNum(r.qtyStr)
        const price    = parseNum(r.unitPriceStr)
        const subtotal = qty * price
        const disc     = calcDiscountAmount(subtotal, r.discountStr, r.discountType)
        const total    = Math.max(0, subtotal - disc)
        return {
          product_id:      r.productId,
          unit_id:         r.unitId,
          qty,
          unit_price:      price,
          discount_str:    r.discountStr.trim() || null,
          discount_type:   r.discountType,
          discount_amount: disc,
          subtotal,
          total,
        }
      }),
    })

    if (error) { setFormErr(error.message); setSaving(false); return }

    setMode('list')
    setFSupplier(null); setGrRef(null); setFNote(''); setFDueDate('')
    setFDate(new Date().toISOString().split('T')[0])
    setItems([newEmptyRow()])
    loadPis()
    setSaving(false)
  }

  // ── Render ───────────────────────────────────────────────────
  if (loadingUser || loadingGr) {
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
        <h1 className="text-white font-semibold text-sm">Invoice Pembelian</h1>
        <div className="flex-1" />
        {mode === 'list' ? (
          <button onClick={() => setMode('create')}
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
            + Buat PI
          </button>
        ) : (
          <button onClick={() => { setMode('list'); setFormErr(null) }}
            className="text-gray-500 hover:text-white text-sm transition-colors">
            Batal
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4">

        {/* ── Form ──────────────────────────────────────────── */}
        {mode === 'create' && (
          <div className="space-y-4">

            {/* Info header */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4 space-y-3">
              <h2 className="text-white font-semibold text-sm">Info Invoice</h2>

              {grRef && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 text-xs text-indigo-300">
                  Dari Penerimaan: <span className="font-semibold">{grRef.code}</span>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">Supplier *</label>
                {grRef ? (
                  <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                    {suppliers.find(s => s.id === fSupplier)?.name ?? '—'}
                  </div>
                ) : (
                  <DarkSelect
                    value={fSupplier ? String(fSupplier) : ''}
                    onChange={v => setFSupplier(v ? Number(v) : null)}
                    options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
                    placeholder="— Pilih supplier —"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tanggal Invoice *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Jatuh Tempo</label>
                  <input type="date" value={fDueDate} onChange={e => setFDueDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Catatan</label>
                <input type="text" value={fNote} onChange={e => setFNote(e.target.value)}
                  placeholder="Opsional"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            {/* Items */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">Detail Barang</h2>
                <button onClick={addRow} className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors">
                  + Tambah baris
                </button>
              </div>

              <div className="space-y-3">
                {items.map((row, idx) => (
                  <InvoiceRowForm
                    key={row.rowId}
                    row={row}
                    idx={idx}
                    canRemove={items.length > 1}
                    onUnitPriceChange={onUnitPriceChange}
                    onDiscountChange={onDiscountChange}
                    onDiscountTypeToggle={onDiscountTypeToggle}
                    onTotalChange={onTotalChange}
                    onQtyChange={onQtyChange}
                    onProductSearch={onProductSearch}
                    onSelectProduct={selectProduct}
                    onUpdateRow={updateRow}
                    onRemoveRow={removeRow}
                  />
                ))}
              </div>
            </div>

            {/* Grand total summary */}
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span>{fmtRp(grandSubtotal)}</span>
              </div>
              {grandDiscount > 0 && (
                <div className="flex justify-between text-amber-400/80">
                  <span>Total Diskon</span>
                  <span>- {fmtRp(grandDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-white font-bold text-base border-t border-white/10 pt-2 mt-2">
                <span>Total</span>
                <span>{fmtRp(grandTotal)}</span>
              </div>
            </div>

            {formErr && (
              <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-2.5">{formErr}</p>
            )}
            <button onClick={submit} disabled={saving}
              className="w-full py-3.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40">
              {saving ? 'Menyimpan…' : '✓ Simpan Invoice'}
            </button>
          </div>
        )}

        {/* ── List ──────────────────────────────────────────── */}
        {mode === 'list' && (
          <div className="space-y-3">
            {loadingPis ? (
              <p className="text-center text-gray-600 py-12 text-sm">Memuat…</p>
            ) : pis.length === 0 ? (
              <p className="text-center text-gray-600 py-12 text-sm">Belum ada invoice pembelian.</p>
            ) : (
              pis.map(pi => {
                const isOpen = expandedId === pi.id
                return (
                  <div key={pi.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                    <button onClick={() => setExpandedId(isOpen ? null : pi.id)}
                      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-white/[0.03] transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white text-sm font-semibold">{pi.code}</span>
                          {pi.gr && <span className="text-gray-600 text-xs">dari {pi.gr.code}</span>}
                          <span className="text-gray-600 text-xs">{fmtDate(pi.invoice_date)}</span>
                          {pi.due_date && (
                            <span className="text-amber-400/70 text-xs">jatuh tempo {fmtDate(pi.due_date)}</span>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs mt-0.5">{pi.supplier?.name ?? '—'}</p>
                        {pi.note && <p className="text-gray-600 text-xs mt-0.5 truncate">{pi.note}</p>}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5">
                        <span className="text-white text-sm font-semibold">{fmtRp(pi.total)}</span>
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
                              <th className="text-right pb-2 font-medium">Harga Satuan</th>
                              <th className="text-right pb-2 font-medium">Diskon</th>
                              <th className="text-right pb-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {pi.purchase_invoice_items.map(item => (
                              <tr key={item.id}>
                                <td className="py-1.5 text-gray-300">{item.product?.name ?? '—'}</td>
                                <td className="py-1.5 text-right text-white">
                                  {item.qty} {item.unit?.unit_name}
                                </td>
                                <td className="py-1.5 text-right text-gray-400">{fmtRp(item.unit_price)}</td>
                                <td className="py-1.5 text-right text-amber-400/70">
                                  {item.discount_amount > 0
                                    ? `${item.discount_str ?? ''} (- ${fmtRp(item.discount_amount)})`
                                    : '—'}
                                </td>
                                <td className="py-1.5 text-right text-white font-medium">{fmtRp(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t border-white/10">
                            {pi.discount_amount > 0 && (
                              <tr>
                                <td colSpan={4} className="pt-1.5 text-gray-500 text-right">Total Diskon</td>
                                <td className="pt-1.5 text-right text-amber-400/70">- {fmtRp(pi.discount_amount)}</td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={4} className="pt-1.5 text-gray-500 text-right font-medium">Total</td>
                              <td className="pt-1.5 text-right text-white font-bold">{fmtRp(pi.total)}</td>
                            </tr>
                          </tfoot>
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

// ── Per-row form component ─────────────────────────────────────
function InvoiceRowForm({
  row, idx, canRemove,
  onUnitPriceChange, onDiscountChange, onDiscountTypeToggle,
  onTotalChange, onQtyChange, onProductSearch, onSelectProduct,
  onUpdateRow, onRemoveRow,
}: {
  row: InvoiceItemRow
  idx: number
  canRemove: boolean
  onUnitPriceChange: (id: string, v: string) => void
  onDiscountChange: (id: string, v: string) => void
  onDiscountTypeToggle: (id: string) => void
  onTotalChange: (id: string, v: string) => void
  onQtyChange: (id: string, v: string) => void
  onProductSearch: (id: string, v: string) => void
  onSelectProduct: (id: string, hit: ProductHit) => void
  onUpdateRow: (id: string, patch: Partial<InvoiceItemRow>) => void
  onRemoveRow: (id: string) => void
}) {
  // Effective discount % label for chained input
  const effPct = row.discountType === 'percent' && row.discountStr.trim()
    ? (1 - calcNetFactor(row.discountStr)) * 100
    : null

  return (
    <div className="border border-white/8 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-600 text-xs">Barang {idx + 1}</span>
        {canRemove && (
          <button onClick={() => onRemoveRow(row.rowId)}
            className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕ Hapus</button>
        )}
      </div>

      {/* Product — read-only if from GR */}
      {row.fromGr ? (
        <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 mb-3">
          <span className="text-white text-sm">{row.productName}</span>
          <span className="text-gray-500 text-xs shrink-0 ml-2">{row.qtyStr} {row.unitName}</span>
        </div>
      ) : (
        <>
          {/* Product search */}
          <div className="relative mb-2">
            <input type="text" value={row.search}
              onChange={e => onProductSearch(row.rowId, e.target.value)}
              onFocus={() => row.hits.length > 0 && onUpdateRow(row.rowId, { dropOpen: true })}
              placeholder="Cari nama barang…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            {row.dropOpen && row.hits.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden">
                {row.hits.map(hit => (
                  <button key={hit.id}
                    onMouseDown={e => { e.preventDefault(); onSelectProduct(row.rowId, hit) }}
                    className="w-full text-left px-3 py-2.5 hover:bg-white/8 text-white text-sm border-b border-white/5 last:border-0">
                    {hit.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Unit + Qty */}
          {row.productId && (
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <DarkSelect
                  value={row.unitId ? String(row.unitId) : ''}
                  onChange={v => onUpdateRow(row.rowId, {
                    unitId: Number(v),
                    unitName: row.unitOptions.find(u => u.id === Number(v))?.unit_name ?? '',
                  })}
                  options={row.unitOptions.map(u => ({ value: String(u.id), label: u.unit_name }))}
                />
              </div>
              <input type="text" inputMode="decimal" value={row.qtyStr}
                onChange={e => onQtyChange(row.rowId, e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="Qty"
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 text-right" />
            </div>
          )}
        </>
      )}

      {/* Price fields */}
      {row.productId && (
        <div className="grid grid-cols-3 gap-2">

          {/* Harga Satuan */}
          <div>
            <label className="block text-gray-600 text-xs mb-1">Harga Satuan</label>
            <input type="text" inputMode="decimal" value={row.unitPriceStr}
              onChange={e => onUnitPriceChange(row.rowId, e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={e => {
                const n = parseNum(e.target.value)
                if (n > 0) onUnitPriceChange(row.rowId, fmtInput(n))
              }}
              placeholder="0"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 text-right" />
          </div>

          {/* Diskon */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-600 text-xs">
                Diskon
                {effPct !== null && effPct > 0 && (
                  <span className="text-amber-400/70 ml-1 tabular-nums">
                    ≈{effPct.toFixed(2).replace(/\.?0+$/, '')}%
                  </span>
                )}
              </span>
              <div className="flex rounded overflow-hidden border border-white/15 text-xs">
                <button
                  onClick={() => row.discountType !== 'percent' && onDiscountTypeToggle(row.rowId)}
                  className={`px-2 py-0.5 transition-colors ${
                    row.discountType === 'percent'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/5 text-gray-500 hover:text-white'
                  }`}
                >%</button>
                <button
                  onClick={() => row.discountType !== 'amount' && onDiscountTypeToggle(row.rowId)}
                  className={`px-2 py-0.5 transition-colors border-l border-white/15 ${
                    row.discountType === 'amount'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/5 text-gray-500 hover:text-white'
                  }`}
                >Rp</button>
              </div>
            </div>
            <input type="text" value={row.discountStr}
              onChange={e => onDiscountChange(row.rowId, e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={e => {
                if (row.discountType === 'amount') {
                  const n = parseNum(e.target.value)
                  if (n > 0) onDiscountChange(row.rowId, fmtInput(n))
                }
              }}
              placeholder={row.discountType === 'percent' ? '10 / 5+3' : '0'}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 text-right" />
          </div>

          {/* Harga Total */}
          <div>
            <label className="block text-gray-600 text-xs mb-1">Harga Total</label>
            <input type="text" inputMode="decimal" value={row.totalStr}
              onChange={e => onTotalChange(row.rowId, e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={e => {
                const n = parseNum(e.target.value)
                if (n > 0) onTotalChange(row.rowId, fmtInput(n))
              }}
              placeholder="0"
              className="w-full bg-indigo-500/8 border border-indigo-500/25 rounded-lg px-3 py-2 text-indigo-200 text-sm focus:outline-none focus:border-indigo-500 text-right font-medium" />
          </div>
        </div>
      )}
    </div>
  )
}
