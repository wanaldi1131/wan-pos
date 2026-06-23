'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DarkSelect } from '@/components/DarkSelect'
import type { InvoiceItemRow, ProductHit, PiRecord } from './_types'
import {
  fmtDate, fmtRp, parseNum, fmtInput,
  calcDiscountAmount, recomputeTotal, recomputePrice, newEmptyRow,
} from './_helpers'
import { InvoiceRowForm } from './_components/InvoiceRowForm'

export default function PurchaseInvoicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-500 text-base">Memuat…</span>
      </div>
    }>
      <PurchaseInvoiceInner />
    </Suspense>
  )
}

function PurchaseInvoiceInner() {
  const sb = createClient()
  const searchParams = useSearchParams()
  const grParam   = searchParams.get('gr')
  const modeParam = searchParams.get('mode')

  const [userId, setUserId]           = useState<string | null>(null)
  const [userRole, setUserRole]       = useState<string | null>(null)
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

  // ── Auth ─────────────────────────────────────────────────────
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

  // ── Load PI list ──────────────────────────────────────────────
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

  // ── Load reference data ───────────────────────────────────────
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

  // ── Pre-fill dari GR ──────────────────────────────────────────
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

  // ── Row state helpers ─────────────────────────────────────────
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

  // ── Grand totals ──────────────────────────────────────────────
  const grandRows = items.map(r => {
    const qty  = parseNum(r.qtyStr)
    const sub  = qty * parseNum(r.unitPriceStr)
    const disc = calcDiscountAmount(sub, r.discountStr, r.discountType)
    return { sub, disc, tot: Math.max(0, sub - disc) }
  })
  const grandSubtotal = grandRows.reduce((a, r) => a + r.sub, 0)
  const grandDiscount = grandRows.reduce((a, r) => a + r.disc, 0)
  const grandTotal    = grandRows.reduce((a, r) => a + r.tot, 0)

  // ── Submit ────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────
  if (loadingUser || loadingGr) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-500 text-base">Memuat…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <a href="/admin" className="text-gray-500 hover:text-gray-900 transition-colors text-base">← Admin</a>
        <span className="text-gray-400">|</span>
        <h1 className="text-gray-900 font-semibold text-base">Invoice Pembelian</h1>
        <div className="flex-1" />
        {mode === 'list' ? (
          <button onClick={() => setMode('create')}
            className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-base font-medium px-3 py-1.5 rounded-lg transition-colors">
            + Buat PI
          </button>
        ) : (
          <button onClick={() => { setMode('list'); setFormErr(null) }}
            className="text-gray-500 hover:text-gray-900 text-base transition-colors">
            Batal
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4">

        {/* ── Form ─────────────────────────────────────────── */}
        {mode === 'create' && (
          <div className="space-y-4">

            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <h2 className="text-gray-900 font-semibold text-base">Info Invoice</h2>

              {grRef && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-600">
                  Dari Penerimaan: <span className="font-semibold">{grRef.code}</span>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">Supplier *</label>
                {grRef ? (
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base">
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
                  <label className="block text-sm text-gray-500 mb-1">Tanggal Invoice *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Jatuh Tempo</label>
                  <input type="date" value={fDueDate} onChange={e => setFDueDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Catatan</label>
                <input type="text" value={fNote} onChange={e => setFNote(e.target.value)}
                  placeholder="Opsional"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
              </div>
            </div>

            {/* Items */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-gray-900 font-semibold text-base">Detail Barang</h2>
                <button onClick={addRow} className="text-orange-400 hover:text-orange-600 text-sm transition-colors">
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

            {/* Grand total */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-1.5 text-base">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{fmtRp(grandSubtotal)}</span>
              </div>
              {grandDiscount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Total Diskon</span>
                  <span>- {fmtRp(grandDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-900 font-bold text-base border-t border-gray-200 pt-2 mt-2">
                <span>Total</span>
                <span>{fmtRp(grandTotal)}</span>
              </div>
            </div>

            {formErr && (
              <p className="text-red-600 text-base bg-red-50 rounded-xl px-4 py-2.5">{formErr}</p>
            )}
            <button onClick={submit} disabled={saving}
              className="w-full py-3.5 rounded-xl text-base font-bold bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40">
              {saving ? 'Menyimpan…' : '✓ Simpan Invoice'}
            </button>
          </div>
        )}

        {/* ── List ─────────────────────────────────────────── */}
        {mode === 'list' && (
          <div className="space-y-3">
            {loadingPis ? (
              <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
            ) : pis.length === 0 ? (
              <p className="text-center text-gray-500 py-12 text-base">Belum ada invoice pembelian.</p>
            ) : (
              pis.map(pi => {
                const isOpen = expandedId === pi.id
                return (
                  <div key={pi.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <button onClick={() => setExpandedId(isOpen ? null : pi.id)}
                      className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-gray-900 text-base font-semibold">{pi.code}</span>
                          {pi.gr && <span className="text-gray-500 text-sm">dari {pi.gr.code}</span>}
                          <span className="text-gray-500 text-sm">{fmtDate(pi.invoice_date)}</span>
                          {pi.due_date && (
                            <span className="text-amber-600 text-sm">jatuh tempo {fmtDate(pi.due_date)}</span>
                          )}
                        </div>
                        <p className="text-gray-500 text-sm mt-0.5">{pi.supplier?.name ?? '—'}</p>
                        {pi.note && <p className="text-gray-500 text-sm mt-0.5 truncate">{pi.note}</p>}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-0.5">
                        <span className="text-gray-900 text-base font-semibold">{fmtRp(pi.total)}</span>
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
                              <th className="text-right pb-2 font-medium">Harga Satuan</th>
                              <th className="text-right pb-2 font-medium">Diskon</th>
                              <th className="text-right pb-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {pi.purchase_invoice_items.map(item => (
                              <tr key={item.id}>
                                <td className="py-1.5 text-gray-400">{item.product?.name ?? '—'}</td>
                                <td className="py-1.5 text-right text-gray-900">
                                  {item.qty} {item.unit?.unit_name}
                                </td>
                                <td className="py-1.5 text-right text-gray-500">{fmtRp(item.unit_price)}</td>
                                <td className="py-1.5 text-right text-amber-600">
                                  {item.discount_amount > 0
                                    ? `${item.discount_str ?? ''} (- ${fmtRp(item.discount_amount)})`
                                    : '—'}
                                </td>
                                <td className="py-1.5 text-right text-gray-900 font-medium">{fmtRp(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t border-gray-200">
                            {pi.discount_amount > 0 && (
                              <tr>
                                <td colSpan={4} className="pt-1.5 text-gray-500 text-right">Total Diskon</td>
                                <td className="pt-1.5 text-right text-amber-600">- {fmtRp(pi.discount_amount)}</td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={4} className="pt-1.5 text-gray-500 text-right font-medium">Total</td>
                              <td className="pt-1.5 text-right text-gray-900 font-bold">{fmtRp(pi.total)}</td>
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
