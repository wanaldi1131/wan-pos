'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

type Kasir = {
  id: string
  full_name: string
  email_login: string
}

const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function LoginPage() {
  const [kasirs, setKasirs] = useState<Kasir[]>([])
  const [loadingKasirs, setLoadingKasirs] = useState(true)
  const [selected, setSelected] = useState<Kasir | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Admin login
  const [adminMode, setAdminMode] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  useEffect(() => {
    createClient()
      .from('profiles')
      .select('id, full_name, email_login')
      .eq('role', 'kasir')
      .eq('active', true)
      .then(({ data, error }) => {
        console.log('[login] kasir data:', data, 'error:', error)
        setKasirs(data ?? [])
        setLoadingKasirs(false)
      })
  }, [])

  function selectKasir(kasir: Kasir) {
    setSelected(kasir)
    setPin('')
    setError('')
  }

  function pressDigit(digit: string) {
    if (pin.length >= 6 || submitting) return
    const next = pin + digit
    setPin(next)
    if (next.length === 6) doLogin(next)
  }

  function pressBackspace() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  async function doLogin(pinValue: string) {
    if (!selected) return
    setSubmitting(true)
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: selected.email_login,
      password: pinValue,
    })
    setSubmitting(false)
    if (authError) {
      setError('PIN salah')
      setPin('')
    }
  }

  async function doAdminLogin(e: React.SyntheticEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    })
    setSubmitting(false)
    if (authError) {
      setError('Email atau password salah')
    }
  }

  if (adminMode) {
    return (
      <div className="min-h-screen bg-gray-950 relative flex flex-col items-center justify-center gap-6 p-6">
        <button
          className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          onClick={() => { setAdminMode(false); setError('') }}
        >
          ← Kembali
        </button>

        <Card className="w-full max-w-xs">
          <CardHeader>
            <p className="text-center text-gray-400 text-sm">Masuk sebagai</p>
            <p className="text-center text-white text-2xl font-bold">Admin</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={doAdminLogin} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="Email"
                autoFocus
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                className="w-full bg-white/8 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
              />
              <input
                type="password"
                placeholder="Password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                className="w-full bg-white/8 text-white placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
              />
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <Button
                type="submit"
                disabled={submitting || !adminEmail || !adminPassword}
                className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 border-0 text-white font-bold disabled:opacity-30"
              >
                {submitting ? 'Memeriksa...' : 'Masuk'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-white text-3xl font-bold tracking-tight">Siapa kamu?</h1>

        {loadingKasirs ? (
          <p className="text-gray-500 text-lg">Memuat...</p>
        ) : kasirs.length === 0 ? (
          <p className="text-gray-500 text-lg">Tidak ada kasir aktif.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            {kasirs.map(k => (
              <Button
                key={k.id}
                onClick={() => selectKasir(k)}
                className="h-28 text-xl font-semibold rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white border-0"
              >
                {k.full_name}
              </Button>
            ))}
          </div>
        )}

        <button
          onClick={() => setAdminMode(true)}
          className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
        >
          Masuk sebagai Admin
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 relative flex flex-col items-center justify-center gap-6 p-6">
      <button
        className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors"
        onClick={() => { setSelected(null); setPin(''); setError('') }}
      >
        ← Ganti kasir
      </button>

      <Card className="w-full max-w-xs">
        <CardHeader>
          <p className="text-center text-gray-400 text-sm">Masuk sebagai</p>
          <p className="text-center text-white text-2xl font-bold">{selected.full_name}</p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {/* PIN dots */}
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-colors ${
                  i < pin.length
                    ? 'bg-indigo-400'
                    : 'bg-white/20 border border-white/30'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-400 font-medium text-base">{error}</p>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 w-full">
            {NUMPAD.map((key, i) =>
              key === '' ? (
                <div key={i} />
              ) : key === '⌫' ? (
                <Button
                  key={i}
                  variant="outline"
                  onClick={pressBackspace}
                  disabled={submitting || pin.length === 0}
                  className="h-16 text-2xl rounded-2xl border-white/20 bg-white/5 hover:bg-white/10 text-white"
                >
                  ⌫
                </Button>
              ) : (
                <Button
                  key={i}
                  variant="outline"
                  onClick={() => pressDigit(key)}
                  disabled={submitting || pin.length >= 6}
                  className="h-16 text-2xl font-semibold rounded-2xl border-white/20 bg-white/5 hover:bg-white/10 text-white"
                >
                  {key}
                </Button>
              )
            )}
          </div>

          {submitting && (
            <p className="text-gray-400 text-sm animate-pulse">Memeriksa PIN...</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
