'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((mod) => mod.PluggyConnect),
  { ssr: false }
)
import {
  Landmark, Plus, RefreshCw, Wifi, WifiOff,
  CreditCard, Wallet, PiggyBank, TrendingUp, MoreHorizontal
} from 'lucide-react'
import { formatCurrency, ACCOUNT_TYPE_LABELS } from '@/lib/utils'
import type { Account } from '@/types'
import toast from 'react-hot-toast'

const ACCOUNT_ICONS: Record<string, React.ReactNode> = {
  checking: <Landmark size={18} />,
  savings: <PiggyBank size={18} />,
  credit: <CreditCard size={18} />,
  investment: <TrendingUp size={18} />,
  wallet: <Wallet size={18} />,
  other: <MoreHorizontal size={18} />,
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showPluggyConnect, setShowPluggyConnect] = useState(false)
  const [connectToken, setConnectToken] = useState<string | null>(null)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts')
      const json = await res.json()
      if (json.data) setAccounts(json.data)
    } catch {
      toast.error('Erro ao carregar contas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const handleOpenPluggyConnect = async () => {
    try {
      const res = await fetch('/api/pluggy/connect-token', { method: 'POST' })
      const json = await res.json()

      if (json.error) {
        toast.error(json.error)
        return
      }

      setConnectToken(json.data.accessToken)
      setShowPluggyConnect(true)
    } catch {
      toast.error('Erro ao iniciar conexão bancária')
    }
  }

  const handlePluggySuccess = async (data: { item: { id: string } }) => {
    setShowPluggyConnect(false)
    setConnectToken(null)

    try {
      // Save the item ID to the user's profile
      await fetch('/api/pluggy/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: data.item.id }),
      })

      toast.success('Banco conectado! Sincronizando dados...')

      // Trigger sync
      await handleSync()
    } catch {
      toast.error('Erro ao salvar conexão')
    }
  }

  const handlePluggyError = (error: { message: string }) => {
    setShowPluggyConnect(false)
    setConnectToken(null)
    toast.error(`Erro na conexão: ${error.message}`)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/pluggy/sync', { method: 'POST' })
      const json = await res.json()

      if (json.error) {
        toast.error(json.error)
        return
      }

      const { accountsSynced, transactionsSynced, errors } = json.data

      if (errors?.length > 0) {
        toast.error(`Sincronização parcial: ${errors[0]}`)
      } else {
        toast.success(
          `Sincronizado! ${accountsSynced} conta${accountsSynced !== 1 ? 's' : ''}, ${transactionsSynced} transaç${transactionsSynced !== 1 ? 'ões' : 'ão'}`
        )
      }

      // Refresh accounts list
      await fetchAccounts()
    } catch {
      toast.error('Erro ao sincronizar dados')
    } finally {
      setSyncing(false)
    }
  }

  const totalBalance = accounts
    .filter(a => a.type !== 'credit')
    .reduce((sum, a) => sum + a.balance, 0)

  const totalCredit = accounts
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + Math.abs(a.balance), 0)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Contas Bancárias
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Gerencie suas contas e conexões bancárias
          </p>
        </div>
        <div className="flex gap-2">
          {accounts.length > 0 && (
            <button
              className="btn btn-secondary text-sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          )}
          <button
            className="btn btn-primary text-sm"
            onClick={handleOpenPluggyConnect}
          >
            <Plus size={15} />
            Conectar banco
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="card p-5">
            <p className="section-title mb-1">Saldo total</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
          {totalCredit > 0 && (
            <div className="card p-5">
              <p className="section-title mb-1">Fatura de crédito</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>
                {formatCurrency(totalCredit)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 animate-shimmer" style={{ height: 80 }} />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div
          className="card p-12 text-center"
          style={{ border: '2px dashed var(--border)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--accent-muted)' }}
          >
            <Landmark size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Nenhuma conta conectada
          </h3>
          <p className="mb-6" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 360, margin: '0 auto 1.5rem' }}>
            Conecte seus bancos pelo Pluggy para sincronizar automaticamente suas contas e transações.
          </p>
          <button
            className="btn btn-primary text-sm mx-auto"
            onClick={handleOpenPluggyConnect}
          >
            <Plus size={15} />
            Conectar banco
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => (
            <div key={account.id} className="card p-5">
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                >
                  {account.institution_logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={account.institution_logo}
                      alt={account.institution || ''}
                      className="w-6 h-6 rounded"
                    />
                  ) : (
                    ACCOUNT_ICONS[account.type] || <Landmark size={18} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate" style={{ color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                      {account.name}
                    </p>
                    {account.pluggy_account_id ? (
                      <span title="Sincronizada via Pluggy" className="flex">
                        <Wifi size={12} style={{ color: 'var(--success)' }} />
                      </span>
                    ) : (
                      <span title="Manual" className="flex">
                        <WifiOff size={12} style={{ color: 'var(--text-muted)' }} />
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                    {account.institution || ACCOUNT_TYPE_LABELS[account.type] || 'Conta'}
                    {account.last_synced_at && (
                      <span> · Sincronizado {new Date(account.last_synced_at).toLocaleDateString('pt-BR')}</span>
                    )}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className="font-semibold"
                    style={{
                      color: account.type === 'credit'
                        ? 'var(--danger)'
                        : account.balance >= 0
                          ? 'var(--text-primary)'
                          : 'var(--danger)',
                      fontSize: '0.9375rem'
                    }}
                  >
                    {formatCurrency(account.type === 'credit' ? -Math.abs(account.balance) : account.balance)}
                  </p>
                  {account.credit_limit && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Limite: {formatCurrency(account.credit_limit)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pluggy Connect Widget */}
      {showPluggyConnect && connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          onSuccess={handlePluggySuccess}
          onError={handlePluggyError}
          onClose={() => {
            setShowPluggyConnect(false)
            setConnectToken(null)
          }}
          language="pt"
        />
      )}
    </div>
  )
}
