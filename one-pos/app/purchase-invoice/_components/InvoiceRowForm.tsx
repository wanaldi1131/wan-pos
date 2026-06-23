'use client'

import { DarkSelect } from '@/components/DarkSelect'
import type { InvoiceItemRow, ProductHit } from '../_types'
import { calcNetFactor, parseNum, fmtInput } from '../_helpers'

export function InvoiceRowForm({
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
  const effPct = row.discountType === 'percent' && row.discountStr.trim()
    ? (1 - calcNetFactor(row.discountStr)) * 100
    : null

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm">Barang {idx + 1}</span>
        {canRemove && (
          <button onClick={() => onRemoveRow(row.rowId)}
            className="text-gray-500 hover:text-red-600 text-sm transition-colors">✕ Hapus</button>
        )}
      </div>

      {/* Product — read-only if from GR */}
      {row.fromGr ? (
        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 mb-3">
          <span className="text-gray-900 text-base">{row.productName}</span>
          <span className="text-gray-500 text-sm shrink-0 ml-2">{row.qtyStr} {row.unitName}</span>
        </div>
      ) : (
        <>
          {/* Product search */}
          <div className="relative mb-2">
            <input type="text" value={row.search}
              onChange={e => onProductSearch(row.rowId, e.target.value)}
              onFocus={() => row.hits.length > 0 && onUpdateRow(row.rowId, { dropOpen: true })}
              placeholder="Cari nama barang…"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
            {row.dropOpen && row.hits.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-md z-30 overflow-hidden">
                {row.hits.map(hit => (
                  <button key={hit.id}
                    onMouseDown={e => { e.preventDefault(); onSelectProduct(row.rowId, hit) }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-100 text-gray-900 text-base border-b border-gray-100 last:border-0">
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
                className="w-20 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500 text-right" />
            </div>
          )}
        </>
      )}

      {/* Price fields */}
      {row.productId && (
        <div className="grid grid-cols-3 gap-2">

          {/* Harga Satuan */}
          <div>
            <label className="block text-gray-500 text-sm mb-1">Harga Satuan</label>
            <input type="text" inputMode="decimal" value={row.unitPriceStr}
              onChange={e => onUnitPriceChange(row.rowId, e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={e => {
                const n = parseNum(e.target.value)
                if (n > 0) onUnitPriceChange(row.rowId, fmtInput(n))
              }}
              placeholder="0"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500 text-right" />
          </div>

          {/* Diskon */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-500 text-sm">
                Diskon
                {effPct !== null && effPct > 0 && (
                  <span className="text-amber-600 ml-1 tabular-nums">
                    ≈{effPct.toFixed(2).replace(/\.?0+$/, '')}%
                  </span>
                )}
              </span>
              <div className="flex rounded overflow-hidden border border-gray-300 text-sm">
                <button
                  onClick={() => row.discountType !== 'percent' && onDiscountTypeToggle(row.rowId)}
                  className={`px-2 py-0.5 transition-colors ${
                    row.discountType === 'percent'
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-gray-500 hover:text-gray-900'
                  }`}
                >%</button>
                <button
                  onClick={() => row.discountType !== 'amount' && onDiscountTypeToggle(row.rowId)}
                  className={`px-2 py-0.5 transition-colors border-l border-gray-300 ${
                    row.discountType === 'amount'
                      ? 'bg-orange-600 text-white'
                      : 'bg-white text-gray-500 hover:text-gray-900'
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
              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500 text-right" />
          </div>

          {/* Harga Total */}
          <div>
            <label className="block text-gray-500 text-sm mb-1">Harga Total</label>
            <input type="text" inputMode="decimal" value={row.totalStr}
              onChange={e => onTotalChange(row.rowId, e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={e => {
                const n = parseNum(e.target.value)
                if (n > 0) onTotalChange(row.rowId, fmtInput(n))
              }}
              placeholder="0"
              className="w-full bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-orange-600 text-base focus:outline-none focus:border-orange-500 text-right font-medium" />
          </div>
        </div>
      )}
    </div>
  )
}
