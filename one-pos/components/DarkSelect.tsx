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
        className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between transition-colors focus:outline-none ${
          open ? 'border-indigo-500' : 'border-white/10 hover:border-white/20'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={selected ? 'text-white' : 'text-gray-600'}>
          {selected?.label ?? placeholder}
        </span>
        <span className={`text-gray-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-xl shadow-2xl z-40 overflow-hidden max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-3 text-gray-600 text-sm">Tidak ada pilihan</p>
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
                className={`w-full text-left px-3 py-2.5 text-sm border-b border-white/5 last:border-0 transition-colors ${
                  opt.value === value
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-white hover:bg-white/8'
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
