'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import TabAntaran    from '../admin/_tabs/TabAntaran'
import TabBelumLunas from '../admin/_tabs/TabBelumLunas'
import TabPendapatan from '../admin/_tabs/TabPendapatan'
import TabKasTunai   from '../admin/_tabs/TabKasTunai'

type Tab = 'antaran' | 'belum_lunas' | 'pendapatan' | 'kas_tunai'

export default function DashboardPage() {
  const sb = createClient()
  const [user, setUser]         = useState<User | null | undefined>(undefined)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>('antaran')
  const [antaranCount, setAntaranCount]       = useState(0)
  const [belumLunasCount, setBelumLunasCount] = useState(0)

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      setUser(data.user ?? null)
      if (data.user) {
        const { data: profile } = await sb
          .from('profiles').select('role').eq('id', data.user.id).single()
        setUserRole(profile?.role ?? null)
      }
    })
  }, [sb])

  // Fetch count badge langsung saat user siap, tanpa tunggu tab dibuka
  useEffect(() => {
    if (!user) return

    // Belum lunas: cukup count
    sb.from('sales')
      .select('*', { count: 'exact', head: true })
      .eq('pay_status', 'belum')
      .eq('voided', false)
      .then(({ count }) => setBelumLunasCount(count ?? 0))

    // Antaran: perlu join untuk filter hasPendingDispatch
    sb.from('sales')
      .select('surat_jalan(status, surat_jalan_lines(base_qty)), sale_items(base_qty)')
      .eq('fulfillment', 'antar')
      .eq('voided', false)
      .limit(200)
      .then(({ data }) => {
        const count = (data ?? []).filter((s: any) => {
          const totalBase      = (s.sale_items ?? []).reduce((acc: number, i: any) => acc + Number(i.base_qty), 0)
          const dispatchedBase = (s.surat_jalan ?? [])
            .flatMap((sj: any) => sj.surat_jalan_lines ?? [])
            .reduce((acc: number, l: any) => acc + Number(l.base_qty), 0)
          return dispatchedBase < totalBase || (s.surat_jalan ?? []).some((sj: any) => sj.status === 'dimuat')
        }).length
        setAntaranCount(count)
      })
  }, [user, sb])

  useEffect(() => {
    if (user === null) { window.location.href = '/'; return }
    if (user !== undefined && userRole !== null) {
      const isAdmin = userRole === 'admin' || userRole === 'owner'
      if (!isAdmin) window.location.href = '/'
    }
  }, [user, userRole])

  if (user === undefined || user === null || userRole === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-base">Memuat...</p>
      </div>
    )
  }

  const isAdmin = userRole === 'admin' || userRole === 'owner'
  if (!isAdmin) return null

  const TABS: { v: Tab; label: string; count?: number; badgeCls?: string }[] = [
    { v: 'antaran',     label: 'Pengiriman',  count: antaranCount,    badgeCls: 'bg-amber-500 text-black' },
    { v: 'belum_lunas', label: 'Belum Lunas', count: belumLunasCount, badgeCls: 'bg-red-500 text-white'  },
    { v: 'pendapatan',  label: 'Pendapatan' },
    { v: 'kas_tunai',   label: 'Kas Tunai'  },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col select-none">

      <div className="flex gap-1.5 px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0 overflow-x-auto">
        {TABS.map(({ v, label, count, badgeCls }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold transition-colors shrink-0 ${
              tab === v ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
            {!!count && count > 0 && (
              <span className={`text-sm font-bold px-1.5 py-0.5 rounded-full ${badgeCls}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {tab === 'antaran'     && <TabAntaran    user={user} isAdmin={isAdmin} onCountChange={setAntaranCount} />}
          {tab === 'belum_lunas' && <TabBelumLunas user={user} isAdmin={isAdmin} onCountChange={setBelumLunasCount} />}
          {tab === 'pendapatan'  && <TabPendapatan user={user} />}
          {tab === 'kas_tunai'   && <TabKasTunai   user={user} />}
        </div>
      </div>
    </div>
  )
}
