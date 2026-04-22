'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Filter, ArrowUpRight, ArrowDownRight, Pencil, Trash2, X, Sparkles, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/utils'
import type { Transaction, Category, Account } from '@/types'
import TransactionModal from '@/components/transactions/TransactionModal'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [page, setPage] = useState(1)
  const [categorizing, setCategorizing] = useState(false)
  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    if (categoryFilter) params.set('category', categoryFilter)
    params.set('page', String(page))
    params.set('limit', String(PER_PAGE))

    const [txRes, catRes, accRes] = await Promise.all([
      fetch(`/api/transactions?${params}`).then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
    ])

    setTransactions(txRes.data ?? [])
    setCategories(catRes.data ?? [])
    setAccounts(accRes.data ?? [])
    setLoading(false)
  }, [search, typeFilter, categoryFilter, page])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta transação?')) return
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    load()
  }

  const handleAutoCategorize = async () => {
    setCategorizing(true)
    try {
      const res = await fetch('/api/transactions/categorize-ai', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro na API')
      if (data.categorizedCount > 0) {
        toast.success(`${data.categorizedCount} transações categorizadas automaticamente!`)
        load()
      } else {
        toast.error(data.message || 'Nenhuma transação pendente foi classificada.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao classificar')
    } finally {
      setCategorizing(false)
    }
  }

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)

  return (
    <>
      <div className="animate-fade-in space-y-5">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Transações</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
              {transactions.length} registros · Receitas: <span className="income-text font-medium">{formatCurrency(totalIncome)}</span>
              {' '}· Gastos: <span className="expense-text font-medium">{formatCurrency(totalExpense)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary"
              onClick={handleAutoCategorize}
              disabled={categorizing}
              title="Classificar itens sem categoria com IA"
            >
              {categorizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} style={{ color: 'var(--accent)' }} />}
              Auto-categorizar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card p-3 flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              className="input pl-9"
              placeholder="Buscar transações…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          {/* Type filter */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-subtle)' }}>
            {(['all', 'income', 'expense'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTypeFilter(t); setPage(1) }}
                className="btn btn-ghost"
                style={{
                  padding: '5px 12px',
                  fontSize: '0.8125rem',
                  background: typeFilter === t ? 'var(--bg-surface)' : 'transparent',
                  color: typeFilter === t
                    ? t === 'income' ? 'var(--success)' : t === 'expense' ? 'var(--danger)' : 'var(--text-primary)'
                    : 'var(--text-muted)',
                  boxShadow: typeFilter === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  borderRadius: 6,
                }}
              >
                {t === 'all' ? 'Todos' : t === 'income' ? 'Receitas' : 'Gastos'}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <select
            className="input"
            style={{ width: 'auto', minWidth: 160 }}
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
          >
            <option value="">Todas categorias</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>

          {(search || typeFilter !== 'all' || categoryFilter) && (
            <button
              className="btn btn-ghost flex items-center gap-1"
              style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}
              onClick={() => { setSearch(''); setTypeFilter('all'); setCategoryFilter(''); setPage(1) }}
            >
              <X size={13} /> Limpar
            </button>
          )}
        </div>

        {/* Table */}
        <div className="card-elevated overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg shimmer" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Nenhuma transação encontrada</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {search ? 'Tente outros termos de busca.' : 'Adicione transações manualmente ou sincronize com o Pluggy.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full hidden lg:table">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Descrição', 'Categoria', 'Conta', 'Data', 'Método', 'Valor'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr
                      key={tx.id}
                      className="cursor-pointer transition-colors hover:bg-gray-50/5 active:bg-gray-50/10"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      onClick={() => { setEditTx(tx); setShowModal(true) }}
                      title="Clique para categorizar"
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                            style={{ background: tx.type === 'income' ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
                            {tx.category?.icon ?? '💰'}
                          </div>
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{tx.description}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="badge" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          {tx.category?.name ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {tx.account?.name ?? '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {formatDate(tx.date)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {PAYMENT_METHOD_LABELS[tx.payment_method] ?? '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="flex items-center gap-1">
                          {tx.type === 'income'
                            ? <ArrowUpRight size={13} style={{ color: 'var(--success)' }} />
                            : <ArrowDownRight size={13} style={{ color: 'var(--danger)' }} />
                          }
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.9375rem',
                            color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {formatCurrency(tx.amount)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile list */}
              <div className="lg:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {transactions.map(tx => (
                  <div key={tx.id} className="p-4 flex items-center gap-3 cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity" onClick={() => { setEditTx(tx); setShowModal(true) }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                      style={{ background: tx.type === 'income' ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
                      {tx.category?.icon ?? '💰'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontWeight: 500, fontSize: '0.875rem' }} className="truncate">{tx.description}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.category?.name} · {formatDate(tx.date)}</p>
                    </div>
                    <span style={{
                      fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.9375rem',
                      color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button className="btn btn-ghost text-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  ← Anterior
                </button>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Página {page}</span>
                <button className="btn btn-ghost text-sm" disabled={transactions.length < PER_PAGE} onClick={() => setPage(p => p + 1)}>
                  Próxima →
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <TransactionModal
          transaction={editTx}
          categories={categories}
          accounts={accounts}
          onClose={() => setShowModal(false)}
          onSave={load}
        />
      )}
    </>
  )
}
