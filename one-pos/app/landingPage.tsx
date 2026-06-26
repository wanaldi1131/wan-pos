'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import LoginPage from './login/page'
import PosPage from './_pos/PosPage'

export default function LandingPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Memuat...</p>
      </div>
    )
  }

  if (user === null) return <LoginPage />

  return <PosPage user={user} />
}
