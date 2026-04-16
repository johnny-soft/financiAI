'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ArrowLeftRight, Tag, Target,
  BarChart2, Settings, Sparkles, RefreshCw,
  ChevronRight, Sun, Moon, Landmark, Menu, X, LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Painel' },
  { href: '/transactions', icon: ArrowLeftRight, label: 'Transações' },
  { href: '/categories', icon: Tag, label: 'Categorias' },
  { href: '/goals', icon: Target, label: 'Metas' },
  { href: '/reports', icon: BarChart2, label: 'Relatórios' },
  { href: '/ai-insights', icon: Sparkles, label: 'IA Financeira' },
]

const bottomItems = [
  { href: '/accounts', icon: Landmark, label: 'Contas' },
  { href: '/settings', icon: Settings, label: 'Configurações' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [dark, setDark] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') {
      setDark(true)
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : '')
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ background: 'var(--accent)' }}
            >
              F
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              FinTrack
            </span>
          </Link>
          <button className="lg:hidden btn btn-ghost p-1" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Sync button */}
        <div className="px-3 mb-2">
          <SyncButton />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          <p className="section-title px-3 mt-2 mb-3">Menu</p>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('sidebar-item', pathname.startsWith(item.href) && 'active')}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {pathname.startsWith(item.href) && (
                <ChevronRight size={13} className="ml-auto" />
              )}
            </Link>
          ))}

          <p className="section-title px-3 mt-5 mb-3">Geral</p>
          {bottomItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn('sidebar-item', pathname.startsWith(item.href) && 'active')}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div
          className="px-3 py-4 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button className="sidebar-item flex-1" onClick={handleLogout} style={{ color: 'var(--text-muted)' }}>
            <LogOut size={16} />
            <span>Sair</span>
          </button>
          <button className="btn btn-ghost p-1.5" onClick={toggleTheme} title="Alternar tema">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header
          className="flex items-center gap-3 px-5 py-4 lg:hidden"
          style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
        >
          <button className="btn btn-ghost p-1" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>FinTrack</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

function SyncButton() {
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/pluggy/sync', { method: 'POST' })
      const json = await res.json()

      if (json.error) {
        const toast = (await import('react-hot-toast')).default
        toast.error(json.error)
        return
      }

      const { accountsSynced, transactionsSynced, errors } = json.data || {}
      const toast = (await import('react-hot-toast')).default

      if (accountsSynced === 0 && transactionsSynced === 0 && (!errors || errors.length === 0)) {
        toast('Nenhuma conexão bancária encontrada.\nConecte um banco na página de Contas.', { icon: 'ℹ️' })
      } else if (errors?.length > 0) {
        toast.error(`Sincronização parcial: ${errors[0]}`)
      } else {
        toast.success(`Sincronizado! ${accountsSynced} conta${accountsSynced !== 1 ? 's' : ''}, ${transactionsSynced} transaç${transactionsSynced !== 1 ? 'ões' : 'ão'}`)
      }
    } catch {
      const toast = (await import('react-hot-toast')).default
      toast.error('Erro ao sincronizar dados')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      className="btn btn-secondary w-full text-xs"
      style={{ height: 34 }}
      disabled={syncing}
    >
      <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
      {syncing ? 'Sincronizando…' : 'Sincronizar dados'}
    </button>
  )
}
