'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const MAIN_NAV = [
  { href: '/',          label: 'POS',       key: 'pos'       },
  { href: '/dashboard', label: 'Dashboard', key: 'dashboard' },
  { href: '/admin',     label: 'Admin',     key: 'admin'     },
]

const SUB_NAV = [
  { href: '/kas',       label: 'Kas',       key: 'kas'       },
  { href: '/pelanggan', label: 'Pelanggan', key: 'pelanggan' },
  { href: '/history',   label: 'Riwayat',   key: 'history'   },
]

function pathToKey(pathname: string): string {
  if (pathname === '/')           return 'pos'
  if (pathname === '/dashboard')  return 'dashboard'
  if (pathname === '/admin')      return 'admin'
  if (pathname === '/kas')        return 'kas'
  if (pathname === '/pelanggan')  return 'pelanggan'
  if (pathname === '/history')    return 'history'
  return ''
}

export default function AppHeader() {
  const pathname = usePathname()
  // undefined = sedang load, null = tidak login, string = sudah login
  const [userName, setUserName] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setUserName(null); return }
      const { data: profile } = await sb
        .from('profiles').select('full_name').eq('id', data.user.id).single()
      setUserName(profile?.full_name ?? '')
    })
  }, [])

  // Sembunyikan hanya ketika sudah pasti tidak login
  if (userName === null) return null

  const current = pathToKey(pathname)

  async function handleLogout() {
    await createClient().auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="flex items-center px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
      {/* Kiri: Brand + Sub-nav */}
      <div className="flex items-center gap-4">
        <Link href="/" className="text-gray-900 font-bold text-base hover:text-gray-700 transition-colors">
          Adi Jaya POS
        </Link>
        <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
          {SUB_NAV.map(n => (
            <Link
              key={n.key}
              href={n.href}
              className={`text-sm font-medium transition-colors ${
                n.key === current
                  ? 'text-orange-600'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Kanan: Main nav + User */}
      <div className="flex items-center gap-4 ml-auto">
        {MAIN_NAV.map(n => (
          <Link
            key={n.key}
            href={n.href}
            className={`text-base font-medium transition-colors ${
              n.key === current
                ? 'text-gray-900 font-semibold'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {n.label}
          </Link>
        ))}
        {userName !== undefined && (
          <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
            <span className="text-gray-500 text-sm">{userName}</span>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-600 text-sm transition-colors"
            >
              Keluar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
