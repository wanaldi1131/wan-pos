const NAV: { href: string; label: string; key: string }[] = [
  { href: '/',           label: 'POS',       key: 'pos'       },
  { href: '/dashboard',  label: 'Dashboard', key: 'dashboard' },
  { href: '/history',    label: 'Riwayat',   key: 'history'   },
  { href: '/admin',      label: 'Admin',     key: 'admin'     },
]

export function PageHeader({
  title,
  current,
}: {
  title: string
  current: 'pos' | 'dashboard' | 'history' | 'admin'
}) {
  return (
    <div className="flex items-center px-4 py-3 bg-white border-b border-gray-200 shrink-0">
      <span className="text-gray-900 font-bold text-base flex-1">{title}</span>
      <div className="flex items-center gap-5">
        {NAV.filter(n => n.key !== current).map(n => (
          <a
            key={n.key}
            href={n.href}
            className="text-gray-500 hover:text-gray-900 text-base font-medium transition-colors"
          >
            {n.label}
          </a>
        ))}
      </div>
    </div>
  )
}
