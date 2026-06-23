'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SaleItem, ReturnableItem } from '../_types'
import { rp, fmtQty } from '../_helpers'

interface Props {
  saleId: number
  items: SaleItem[]
  userId: string
  onSuccess: (total: number) => void
  onCancel: () => void
}

export function ReturPanel({ saleId, items, userId, onSuccess, onCancel }: Props) {
  const [returnableItems, setReturnableItems] = useState<ReturnableItem[]>([])
  const [returnQtys, setReturnQtys]           = useState<Record<number, number>>({})
  const [returnNote, setReturnNote]           = useState('')
  const [returnRefundMethod, setReturnRefundMethod] = useState<'tunai' | 'transfer' | 'nota'>('tunai')
  const [loadingReturn, setLoadingReturn]     = useState(true)
  const [submitting, setSubmitting]           = useState(false)
  const [returnError, setReturnError]         = useState<string | null>(null)

  const returTotal   = returnableItems.reduce((s, i) => s + (returnQtys[i.sale_item_id] ?? 0) * i.unit_price, 0)
  const hasAnyRetur  = returnableItems.some(i => (returnQtys[i.sale_item_id] ?? 0) > 0)

  useEffect(() => {
    const sb = createClient()
    const saleItemIds = items.map(i => i.id)
    sb.from('return_items').select('sale_item_id, qty').in('sale_item_id', saleItemIds)
      .then(({ data: prevReturns }) => {
        const returnedMap: Record<number, number> = {}
        for (const r of prevReturns ?? []) {
          returnedMap[r.sale_item_id] = (returnedMap[r.sale_item_id] ?? 0) + Number(r.qty)
        }
        const list: ReturnableItem[] = items
          .map(item => {
            const already = returnedMap[item.id] ?? 0
            const max_qty = Number(item.qty) - already
            return {
              sale_item_id: item.id,
              product_id: item.product_id,
              product_name: item.product_name,
              unit_name: item.unit_name,
              unit_price: item.unit_price,
              factor_to_base: item.factor_to_base,
              qty: Number(item.qty),
              already_returned: already,
              max_qty,
            }
          })
          .filter(i => i.max_qty > 0)
        setReturnableItems(list)
        setLoadingReturn(false)
      })
  }, [items, saleId])

  async function confirmRetur() {
    const toReturn = returnableItems.filter(i => (returnQtys[i.sale_item_id] ?? 0) > 0)
    if (toReturn.length === 0) return

    const overLimit = toReturn.find(i => (returnQtys[i.sale_item_id] ?? 0) > i.max_qty)
    if (overLimit) {
      setReturnError(`Qty retur "${overLimit.product_name}" melebihi batas (maks ${overLimit.max_qty} ${overLimit.unit_name})`)
      return
    }

    setSubmitting(true)
    setReturnError(null)

    const { data, error } = await createClient().rpc('confirm_return', {
      p_sale_id:       saleId,
      p_cashier_id:    userId,
      p_refund_method: returnRefundMethod,
      p_note:          returnNote || null,
      p_items:         toReturn.map(i => ({
        sale_item_id: i.sale_item_id,
        qty:          returnQtys[i.sale_item_id]!,
      })),
    })

    setSubmitting(false)

    if (error || !data) {
      const msg = error?.message ?? 'Gagal menyimpan retur'
      setReturnError(msg.includes('Qty retur') ? msg : 'Gagal menyimpan retur. Coba lagi.')
      return
    }

    onSuccess(Number((data as { total: number }).total))
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-amber-600 text-sm font-bold uppercase tracking-wide">Pilih Item & Qty Retur</p>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-900 text-sm">✕ Batal</button>
      </div>

      {returnError && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-base flex items-start justify-between gap-2">
          <span>{returnError}</span>
          <button onClick={() => setReturnError(null)} className="shrink-0 opacity-60 hover:opacity-100 text-sm mt-0.5">✕</button>
        </div>
      )}

      {loadingReturn ? (
        <p className="text-gray-500 text-sm text-center py-3">Memuat data retur...</p>
      ) : returnableItems.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-3">Semua item sudah diretur</p>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {returnableItems.map(item => {
              const qty = returnQtys[item.sale_item_id] ?? 0
              const setQty = (v: number) => setReturnQtys(prev => ({
                ...prev,
                [item.sale_item_id]: Math.max(0, Math.min(v, item.max_qty)),
              }))
              return (
                <div key={item.sale_item_id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-base font-medium truncate">{item.product_name}</p>
                    <p className="text-gray-500 text-sm mt-0.5">
                      {fmtQty(item.qty)} {item.unit_name}
                      {item.already_returned > 0 && (
                        <span className="text-amber-600 ml-1.5">· diretur {fmtQty(item.already_returned)}</span>
                      )}
                      <span className="text-gray-500 ml-1.5">· maks {fmtQty(item.max_qty)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setQty(qty - 1)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-base flex items-center justify-center"
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
                      className="w-16 text-gray-900 text-base text-center bg-white/10 border border-gray-300 focus:border-amber-500 rounded-lg h-7 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => setQty(qty + 1)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-base flex items-center justify-center"
                    >+</button>
                    <span className="text-gray-500 text-sm w-10 text-right">{item.unit_name}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <input
            placeholder="Catatan retur (opsional)…"
            value={returnNote}
            onChange={e => setReturnNote(e.target.value)}
            className="w-full bg-white border border-gray-200 focus:border-amber-500 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-base outline-none"
          />

          <div>
            <p className="text-gray-500 text-sm mb-1.5">Kembalikan via</p>
            <div className="flex gap-2">
              {([
                ['tunai',    'Tunai'],
                ['transfer', 'Transfer'],
                ['nota',     'Nota/Kredit'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setReturnRefundMethod(val)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    returnRefundMethod === val
                      ? 'bg-amber-600 text-gray-900'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {returnRefundMethod !== 'tunai' && (
              <p className="text-gray-500 text-sm mt-1">Tidak mempengaruhi saldo kas harian</p>
            )}
          </div>

          <button
            onClick={confirmRetur}
            disabled={!hasAnyRetur || submitting}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-30 text-gray-900 text-base font-bold transition-colors"
          >
            {submitting
              ? 'Memproses…'
              : hasAnyRetur
                ? `Konfirmasi Retur · ${rp(returTotal)}`
                : 'Masukkan qty retur'}
          </button>
        </>
      )}
    </div>
  )
}
