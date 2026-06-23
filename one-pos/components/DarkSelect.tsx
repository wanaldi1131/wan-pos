'use client'

import { useState, useEffect, useRef } from 'react'

export type SelectOption = { value: string; label: string }

export function DarkSelect({
  value,
  onChange,
  options,
  placeholder = '— Pilih —',
  disabled = false,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full bg-white border rounded-lg px-3 py-2 text-base text-left flex items-center justify-between transition-colors focus:outline-none ${
          open ? 'border-orange-500' : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
          {selected?.label ?? placeholder}
        </span>
        <span className={`text-gray-500 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-md z-40 overflow-hidden max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-3 text-gray-500 text-base">Tidak ada pilihan</p>
          ) : (
            options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2.5 text-base border-b border-gray-100 last:border-0 transition-colors ${
                  opt.value === value
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-gray-900 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
