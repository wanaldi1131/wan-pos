'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import LoginPage from './login/page'
import PosPage from './_pos/PosPage'

export default function LandingPage() {
  const [user, setUser]           = useState<User | null | undefined>(undefined)
  const [kasirName, setKasirName] = useState('')

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Ambil nama kasir dari profiles saat user berubah
  useEffect(() => {
    if (!user) { setKasirName(''); return }
    createClient()
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setKasirName(data?.full_name ?? ''))
  }, [user])

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Memuat...</p>
      </div>
    )
  }

  if (user === null) return <LoginPage />

  return <PosPage user={user} kasirName={kasirName} />
}
