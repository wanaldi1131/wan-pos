'use client'

import { Button } from '@/components/ui/button'
import type { PayMethod } from '../_types'
import { PAY_METHODS, rp } from '../_types'

interface Props {
  cartTotal: number
  payMethod: PayMethod
  onPayMethodChange: (m: PayMethod) => void
  submitting: boolean
  checkoutErr: string | null
  onClose: () => void
  onConfirm: () => void
}

export function CheckoutOverlay({ cartTotal, payMethod, onPayMethodChange, submitting, checkoutErr, onClose, onConfirm }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-20 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="bg-white border border-gray-200 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-gray-900 text-xl font-bold">Pembayaran</p>
          <div className="flex items-center gap-3">
            <p className="text-orange-600 text-2xl font-bold">{rp(cartTotal)}</p>
            {!submitting && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-900 text-xl leading-none"
              >✕</button>
            )}
          </div>
        </div>

        {checkoutErr && (
          <p className="text-red-600 text-base bg-red-50 rounded-xl px-4 py-2.5">{checkoutErr}</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {PAY_METHODS.map(({ v, label }) => (
            <button
              key={v}
              onClick={() => onPayMethodChange(v)}
              className={`py-3.5 rounded-xl text-base font-semibold transition-colors ${
                payMethod === v
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          onClick={onConfirm}
          disabled={submitting}
          className="w-full h-14 text-lg font-bold rounded-2xl bg-green-600 hover:bg-green-500 border-0 text-white disabled:opacity-30"
        >
          {submitting ? 'Menyimpan...' : '✓ Konfirmasi Penjualan'}
        </Button>
      </div>
    </div>
  )
}
