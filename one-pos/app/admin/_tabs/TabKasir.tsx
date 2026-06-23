'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { KasirProfile } from '../_types'
import { fmtDate } from '../_helpers'

export default function TabKasir({ user }: { user: User }) {
  const sb = createClient()
  const [list, setList]           = useState<KasirProfile[]>([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState<KasirProfile | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)

  const [name, setName]     = useState('')
  const [code, setCode]     = useState('')
  const [email, setEmail]   = useState('')
  const [pin, setPin]       = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('profiles')
      .select('id, full_name, staff_code, email_login, active, created_at')
      .eq('role', 'kasir')
      .order('created_at', { ascending: true })
    setList(data ?? [])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  async function toggleActive(kasir: KasirProfile) {
    setTogglingId(kasir.id)
    const { data } = await sb.from('profiles')
      .update({ active: !kasir.active })
      .eq('id', kasir.id)
      .select('id, full_name, staff_code, email_login, active, created_at')
      .single()
    setTogglingId(null)
    if (data) {
      setList(prev => prev.map(k => k.id === kasir.id ? data : k))
      setSelected(data)
    }
  }

  async function createKasir() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/kasir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, staff_code: code, email, pin }),
    })
    const json = await res.json()
    setSaving(false)
    if (res.ok) {
      setMsg({ ok: true, text: `Kasir "${name}" berhasil dibuat.` })
      setName(''); setCode(''); setEmail(''); setPin('')
      load()
    } else {
      setMsg({ ok: false, text: json.error ?? 'Gagal membuat kasir.' })
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-900 font-bold text-base">Daftar Kasir</p>
        <button
          onClick={() => { setShowForm(f => !f); setMsg(null) }}
          className="text-sm font-semibold px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors"
        >
          {showForm ? 'Tutup Form' : '+ Tambah Kasir'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
          <p className="text-gray-900 font-semibold text-base">Kasir Baru</p>
          {[
            { label: 'Nama Lengkap', value: name, set: setName, placeholder: 'cth: Budi Santoso', type: 'text' },
            { label: 'Kode Staff',   value: code, set: (v: string) => setCode(v.toLowerCase().replace(/\s/g, '')), placeholder: 'cth: staff03', type: 'text' },
            { label: 'Email Login',  value: email, set: setEmail, placeholder: 'cth: budi@gmail.com', type: 'email' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-gray-500 text-sm mb-1 block">{f.label}</label>
              <input
                type={f.type}
                className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200"
                placeholder={f.placeholder}
                value={f.value}
                onChange={e => f.set(e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="text-gray-500 text-sm mb-1 block">PIN (6 digit)</label>
            <input
              className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200 font-mono tracking-widest"
              placeholder="••••••"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          {msg && (
            <p className={`text-sm px-3 py-2 rounded-xl ${msg.ok ? 'bg-green-500/10 text-green-600' : 'bg-red-50 text-red-600'}`}>{msg.text}</p>
          )}
          <button
            disabled={saving || !name || !code || !email || pin.length !== 6}
            onClick={createKasir}
            className="w-full h-10 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white font-bold text-base transition-colors"
          >
            {saving ? 'Menyimpan...' : 'Buat Kasir'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-base text-center py-8">Memuat...</p>
      ) : list.length === 0 ? (
        <p className="text-gray-500 text-base text-center py-8">Belum ada kasir terdaftar</p>
      ) : (
        <div className="space-y-2">
          {list.map(k => (
            <div key={k.id}>
              <button
                onClick={() => setSelected(prev => prev?.id === k.id ? null : k)}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition-colors flex items-center justify-between gap-3 ${
                  selected?.id === k.id ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${k.active ? 'bg-green-400' : 'bg-gray-400'}`} />
                  <div className="min-w-0">
                    <p className="text-gray-900 font-semibold text-base truncate">{k.full_name}</p>
                    <p className="text-gray-500 text-sm">{k.staff_code ?? '—'}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                  k.active ? 'bg-green-500/15 text-green-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {k.active ? 'Aktif' : 'Nonaktif'}
                </span>
              </button>

              {selected?.id === k.id && (
                <div className="mx-2 mt-1 mb-1 bg-white border border-orange-200 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
                    <div><p className="text-gray-500 text-sm mb-0.5">Nama</p><p className="text-gray-900 font-medium">{k.full_name}</p></div>
                    <div><p className="text-gray-500 text-sm mb-0.5">Kode Staff</p><p className="text-gray-900 font-medium">{k.staff_code ?? '—'}</p></div>
                    <div className="col-span-2"><p className="text-gray-500 text-sm mb-0.5">Email Login</p><p className="text-gray-900 font-medium break-all">{k.email_login ?? '—'}</p></div>
                    <div><p className="text-gray-500 text-sm mb-0.5">Status</p><p className={`font-semibold ${k.active ? 'text-green-600' : 'text-gray-500'}`}>{k.active ? 'Aktif' : 'Nonaktif'}</p></div>
                    <div><p className="text-gray-500 text-sm mb-0.5">Terdaftar</p><p className="text-gray-900">{fmtDate(k.created_at)}</p></div>
                  </div>
                  <button
                    disabled={togglingId === k.id}
                    onClick={() => toggleActive(k)}
                    className={`w-full h-9 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 ${
                      k.active
                        ? 'bg-red-50 text-red-600 border border-red-500/30 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-600 border border-green-500/30 hover:bg-green-500/20'
                    }`}
                  >
                    {togglingId === k.id ? '...' : k.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
