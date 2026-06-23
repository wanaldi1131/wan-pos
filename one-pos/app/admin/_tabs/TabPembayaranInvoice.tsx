'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { DarkSelect } from '@/components/DarkSelect'

const fmtRp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

type Payment = {
  id: number
  amount: number
  paid_at: string
  pay_method: string
  note: string | null
}

type PiRow = {
  id: number
  code: string
  invoice_date: string
  due_date: string | null
  paid_at: string | null
  total: number
  note: string | null
  supplier: { id: number; name: string } | null
  purchase_invoice_payments: Payment[]
}

type PayForm = {
  piId: number
  amount: string
  method: 'tunai' | 'transfer'
  note: string
}

export default function TabPembayaranInvoice({ user }: { user: User }) {
  const sb = createClient()

  const [invoices, setInvoices]   = useState<PiRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([])

  const [fSupplier, setFSupplier] = useState<number | null>(null)
  const [showAll, setShowAll]     = useState(false)

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [payForm, setPayForm]       = useState<PayForm | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('purchase_invoices')
      .select(`
        id, code, invoice_date, due_date, paid_at, total, note,
        supplier:suppliers!supplier_id(id, name),
        purchase_invoice_payments(id, amount, paid_at, pay_method, note)
      `)
      .order('invoice_date', { ascending: true })
      .limit(300)

    if (!showAll) q = q.is('paid_at', null)
    if (fSupplier) q = q.eq('supplier_id', fSupplier)

    const { data } = await q
    setInvoices((data ?? []) as unknown as PiRow[])
    setLoading(false)
  }, [sb, showAll, fSupplier])

  const loadSuppliers = useCallback(async () => {
    const { data } = await sb.from('suppliers').select('id, name').order('name')
    setSuppliers(data ?? [])
  }, [sb])

  useEffect(() => { load(); loadSuppliers() }, [load, loadSuppliers])

  function openPayForm(pi: PiRow & { remaining: number }) {
    setPayForm({ piId: pi.id, amount: String(pi.remaining), method: 'transfer', note: '' })
    setFormErr(null)
  }

  async function submitPayment() {
    if (!payForm) return
    const amount = parseFloat(payForm.amount.replace(/[^0-9.]/g, ''))
    if (!amount || amount <= 0) { setFormErr('Jumlah harus lebih dari 0'); return }

    setSubmitting(true)
    setFormErr(null)
    const { error } = await sb.rpc('record_pi_payment', {
      p_invoice_id: payForm.piId,
      p_amount:     amount,
      p_pay_method: payForm.method,
      p_note:       payForm.note,
      p_created_by: user.id,
    })
    if (error) { setFormErr(error.message); setSubmitting(false); return }
    setPayForm(null)
    setSubmitting(false)
    load()
  }

  const rows = invoices.map(pi => {
    const total_paid = pi.purchase_invoice_payments.reduce((s, p) => s + Number(p.amount), 0)
    const remaining  = Math.max(0, Number(pi.total) - total_paid)
    return { ...pi, total_paid, remaining }
  })

  const totalHutang = rows
    .filter(pi => !pi.paid_at && pi.remaining > 0)
    .reduce((s, pi) => s + pi.remaining, 0)

  return (
    <div className="pb-8">
      <p className="text-gray-900 font-bold text-base mb-4">Pembayaran Invoice Supplier</p>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <DarkSelect
            value={fSupplier ? String(fSupplier) : ''}
            onChange={v => setFSupplier(v ? Number(v) : null)}
            options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
            placeholder="Semua supplier"
          />
        </div>
        <button
          onClick={() => setShowAll(v => !v)}
          className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 ${
            showAll ? 'bg-gray-200 text-gray-700' : 'bg-orange-600 text-white'
          }`}
        >
          {showAll ? 'Semua' : 'Belum Lunas'}
        </button>
      </div>

      {/* Total hutang summary */}
      {!showAll && totalHutang > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
          <p className="text-red-500 text-xs font-medium uppercase tracking-wide mb-0.5">
            Total Hutang{fSupplier && suppliers.find(s => s.id === fSupplier) ? ` — ${suppliers.find(s => s.id === fSupplier)!.name}` : ''}
          </p>
          <p className="text-red-700 text-2xl font-bold">{fmtRp(totalHutang)}</p>
        </div>
      )}

      {/* Invoice list */}
      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-gray-500 py-12 text-base">
            {showAll ? 'Belum ada invoice pembelian.' : 'Tidak ada hutang yang tersisa.'}
          </p>
        ) : (
          rows.map(pi => {
            const isOpen       = expandedId === pi.id
            const isPaid       = !!pi.paid_at || pi.remaining === 0
            const isPartial    = !isPaid && pi.total_paid > 0
            const payFormOpen  = payForm?.piId === pi.id

            return (
              <div key={pi.id} className={`bg-white border rounded-2xl overflow-hidden ${isPaid ? 'border-green-200' : isPartial ? 'border-amber-200' : 'border-gray-200'}`}>
                <button
                  onClick={() => setExpandedId(isOpen ? null : pi.id)}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-900 text-base font-semibold">{pi.code}</span>
                      {isPaid ? (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">LUNAS</span>
                      ) : isPartial ? (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">SEBAGIAN</span>
                      ) : (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">BELUM LUNAS</span>
                      )}
                      <span className="text-gray-500 text-sm">{fmtDate(pi.invoice_date)}</span>
                      {!isPaid && pi.due_date && (
                        <span className="text-amber-600 text-sm">jt {fmtDate(pi.due_date)}</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm mt-0.5">{pi.supplier?.name ?? '—'}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5 ml-2">
                    {isPartial ? (
                      <>
                        <span className="text-red-600 text-base font-bold">sisa {fmtRp(pi.remaining)}</span>
                        <span className="text-gray-400 text-xs">dari {fmtRp(pi.total)}</span>
                      </>
                    ) : (
                      <span className={`text-base font-bold ${isPaid ? 'text-green-600' : 'text-gray-900'}`}>
                        {fmtRp(pi.total)}
                      </span>
                    )}
                    <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-200 px-4 py-3 space-y-3">

                    {/* Payment history */}
                    {pi.purchase_invoice_payments.length > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">Riwayat Pembayaran</p>
                        <div className="space-y-1">
                          {pi.purchase_invoice_payments
                            .slice()
                            .sort((a, b) => new Date(a.paid_at).getTime() - new Date(b.paid_at).getTime())
                            .map(p => (
                              <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                                <div className="min-w-0 flex-1">
                                  <span className="text-gray-900 text-sm font-medium">{fmtRp(p.amount)}</span>
                                  <span className="text-gray-500 text-sm ml-2 capitalize">{p.pay_method}</span>
                                  {p.note && <span className="text-gray-400 text-sm ml-2">· {p.note}</span>}
                                </div>
                                <span className="text-gray-400 text-xs ml-3 shrink-0">{fmtDateTime(p.paid_at)}</span>
                              </div>
                            ))}
                        </div>
                        <div className="flex justify-between text-sm pt-2 mt-1 border-t border-gray-200">
                          <span className="text-gray-500">Total dibayar</span>
                          <span className="text-gray-900 font-medium">{fmtRp(pi.total_paid)}</span>
                        </div>
                        {!isPaid && (
                          <div className="flex justify-between text-sm mt-1">
                            <span className="text-red-600 font-medium">Sisa hutang</span>
                            <span className="text-red-600 font-bold">{fmtRp(pi.remaining)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pay form or button */}
                    {!isPaid && !payFormOpen && (
                      <button
                        onClick={() => openPayForm(pi)}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                      >
                        + Catat Pembayaran
                      </button>
                    )}

                    {!isPaid && payFormOpen && payForm && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
                        <p className="text-gray-700 text-sm font-semibold">Catat Pembayaran</p>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Jumlah (sisa: {fmtRp(pi.remaining)})
                          </label>
                          <input
                            type="number" inputMode="decimal" min={1} step="any"
                            value={payForm.amount}
                            onChange={e => setPayForm(f => f ? { ...f, amount: e.target.value } : f)}
                            onFocus={e => e.target.select()}
                            autoFocus
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Metode</label>
                          <div className="flex gap-2">
                            {(['tunai', 'transfer'] as const).map(m => (
                              <button key={m}
                                onClick={() => setPayForm(f => f ? { ...f, method: m } : f)}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  payForm.method === m
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                {m === 'tunai' ? 'Tunai' : 'Transfer'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Catatan</label>
                          <input type="text"
                            value={payForm.note}
                            onChange={e => setPayForm(f => f ? { ...f, note: e.target.value } : f)}
                            placeholder="Opsional"
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500"
                          />
                        </div>

                        {formErr && <p className="text-red-600 text-sm">{formErr}</p>}

                        <div className="flex gap-2">
                          <button
                            onClick={() => { setPayForm(null); setFormErr(null) }}
                            className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
                          >
                            Batal
                          </button>
                          <button
                            onClick={submitPayment} disabled={submitting}
                            className="flex-1 py-2 rounded-lg text-sm bg-green-600 hover:bg-green-500 text-white font-medium transition-colors disabled:opacity-40"
                          >
                            {submitting ? 'Menyimpan…' : 'Simpan'}
                          </button>
                        </div>
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
}
