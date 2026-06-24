'use client'

import type { Product, PriceOverride } from '../_types'
import { rp, resolvePrice } from '../_types'

export function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
        active
          ? 'bg-orange-600 text-white'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-center text-base whitespace-pre-line">{text}</p>
    </div>
  )
}

export function ProductGrid({
  products, picking, tier, priceOverrides, onPick,
}: {
  products: Product[]
  picking: Product | null
  tier: 'retail' | 'toko'
  priceOverrides?: Record<number, PriceOverride>
  onPick: (p: Product) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {products.map(p => {
        const def      = p.product_units.find(u => u.is_default) ?? p.product_units[0]
        const price    = def ? resolvePrice(def, tier, priceOverrides) : null
        const selected = picking?.id === p.id
        return (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            className={`text-left rounded-2xl p-3 transition-colors border ${
              selected
                ? 'bg-orange-100 border-orange-500 ring-2 ring-orange-500/40'
                : 'bg-white hover:bg-orange-600/15 active:bg-orange-600/30 border-gray-200 hover:border-orange-500/30'
            }`}
          >
            {p.category && (
              <span className="text-gray-500 text-[10px] uppercase tracking-wide">{p.category}</span>
            )}
            <p className="text-gray-900 font-medium text-base leading-snug line-clamp-2 mt-0.5">{p.name}</p>
            {p.sku && <p className="text-gray-500 text-sm mt-0.5">{p.sku}</p>}
            {price != null && def && (
              <p className="text-orange-600 font-bold text-base mt-2">
                {rp(price)}
                <span className="text-gray-500 font-normal text-sm">/{def.unit_name}</span>
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}
