import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { FolderOpen, Settings } from 'lucide-react'
import logoUrl from '../../assets/clip-studio-logo.png'

interface Props { children: ReactNode }

export function AppLayout({ children }: Props) {
  const { pathname } = useLocation()

  const nav = [
    { to: '/', icon: FolderOpen, label: 'Проекты' },
    { to: '/settings', icon: Settings, label: 'Настройки' },
  ]

  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden select-none">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col bg-surface-1 border-r border-border shrink-0">
        {/* Logo — pt-8 leaves room for macOS traffic lights (hiddenInset) */}
        <div className="flex items-center gap-2.5 px-4 pt-10 pb-4 border-b border-border drag-region">
          <img src={logoUrl} alt="Clip Studio" className="w-7 h-7 rounded-lg object-cover" />
          <span className="font-semibold text-sm text-white">Clip Studio</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 flex flex-col gap-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === to
                  ? 'bg-accent/15 text-accent font-medium'
                  : 'text-muted hover:text-white hover:bg-surface-2'
              )}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted/60">v0.1.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
