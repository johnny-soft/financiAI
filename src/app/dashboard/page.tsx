'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank,
  ArrowUpRight, ArrowDownRight, Plus, Sparkles
} from 'lucide-react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { formatCurrency, formatRelativeDate, getMonthName } from '@/lib/utils'
import type { DashboardSummary } from '@/types'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'month' | '3m' | '6m'>('month')

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <DashboardSkeleton />

  const now = new Date()
  const monthName = getMonthName(now.getMonth() + 1)

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
            {monthName} {now.getFullYear()} · visão geral
          </p>
        </div>
        <Link href="/transactions/new" className="btn btn-primary">
          <Plus size={16} />
          Nova transação
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Saldo Total"
          value={formatCurrency(data?.totalBalance ?? 0)}
          icon={<Wallet size={18} />}
          color="var(--accent)"
        />
        <StatCard
          label={`Receitas — ${monthName}`}
          value={formatCurrency(data?.monthIncome ?? 0)}
          icon={<TrendingUp size={18} />}
          color="var(--success)"
          positive
        />
        <StatCard
          label={`Gastos — ${monthName}`}
          value={formatCurrency(data?.monthExpense ?? 0)}
          icon={<TrendingDown size={18} />}
          color="var(--danger)"
          negative
        />
        <StatCard
          label="Taxa de Poupança"
          value={`${data?.savingsRate ?? 0}%`}
          icon={<PiggyBank size={18} />}
          color="var(--warning)"
        />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Area chart */}
        <div className="card-elevated p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Fluxo de Caixa</h2>
            <div className="flex gap-1">
              {(['month', '3m', '6m'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="btn btn-ghost"
                  style={{
                    padding: '3px 10px',
                    fontSize: '0.75rem',
                    background: period === p ? 'var(--accent-muted)' : undefined,
                    color: period === p ? 'var(--accent)' : undefined,
                  }}
                >
                  {p === 'month' ? '1M' : p === '3m' ? '3M' : '6M'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data?.monthlyTrend ?? []}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => {
                  const [, m] = v.split('-')
                  return getMonthName(Number(m), true)
                }}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`}
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number, name: string) => [
                  formatCurrency(v),
                  name === 'income' ? 'Receitas' : 'Gastos'
                ]}
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                }}
              />
              <Area type="monotone" dataKey="income" stroke="var(--success)" fill="url(#incomeGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expense" stroke="var(--danger)" fill="url(#expenseGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="card-elevated p-5">
          <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 16 }}>Gastos por Categoria</h2>
          {data?.topCategories && data.topCategories.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={data.topCategories.slice(0, 6).filter(c => c.total > 0)}
                    dataKey="total"
                    nameKey="category_name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={3}
                  >
                    {data.topCategories.slice(0, 6).filter(c => c.total > 0).map((cat, i) => (
                      <Cell key={i} fill={cat.category_color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v)]}
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      fontSize: 13,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {data.topCategories.slice(0, 5).filter(c => c.total > 0).map((cat, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.category_color }} />
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {cat.category_icon} {cat.category_name}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                      {formatCurrency(cat.total)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent transactions */}
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Últimas Transações</h2>
            <Link href="/transactions" className="btn btn-ghost" style={{ fontSize: '0.8125rem', padding: '4px 8px' }}>
              Ver todas →
            </Link>
          </div>
          {data?.recentTransactions && data.recentTransactions.length > 0 ? (
            <div className="space-y-1">
              {data.recentTransactions.slice(0, 6).map(tx => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg transition-colors"
                  style={{ cursor: 'default' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                    style={{
                      background: tx.type === 'income' ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'color-mix(in srgb, var(--danger) 10%, transparent)'
                    }}
                  >
                    {tx.category?.icon ?? (tx.type === 'income' ? '💰' : '💸')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: '0.875rem', fontWeight: 500 }} className="truncate">{tx.description}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {tx.category?.name ?? '—'} · {formatRelativeDate(tx.date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {tx.type === 'income'
                      ? <ArrowUpRight size={13} style={{ color: 'var(--success)' }} />
                      : <ArrowDownRight size={13} style={{ color: 'var(--danger)' }} />
                    }
                    <span style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: tx.type === 'income' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Nenhuma transação ainda. Sincronize seus dados ou adicione manualmente." />
          )}
        </div>

        {/* Accounts + AI hint */}
        <div className="space-y-4">
          {/* Accounts */}
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Contas</h2>
              <Link href="/accounts" className="btn btn-ghost" style={{ fontSize: '0.8125rem', padding: '4px 8px' }}>
                Gerenciar →
              </Link>
            </div>
            {data?.accounts && data.accounts.length > 0 ? (
              <div className="space-y-2">
                {data.accounts.slice(0, 4).map(acc => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-2.5 rounded-lg"
                    style={{ background: 'var(--bg-subtle)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                        style={{ background: 'var(--bg-surface)' }}
                      >
                        {acc.institution?.[0] ?? '🏦'}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{acc.name}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.institution ?? 'Manual'}</p>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: acc.balance >= 0 ? 'var(--text-primary)' : 'var(--danger)'
                    }}>
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Conecte seus bancos via Pluggy para ver seu saldo aqui." />
            )}
          </div>

          {/* AI Insight teaser */}
          {(data?.unreadInsights ?? 0) > 0 && (
            <Link
              href="/ai-insights"
              className="card-elevated p-4 flex items-start gap-3 group block"
              style={{ textDecoration: 'none', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--accent-muted)' }}
              >
                <Sparkles size={18} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {data.unreadInsights} nova{data.unreadInsights > 1 ? 's' : ''} recomendação{data.unreadInsights > 1 ? 'ões' : ''} da IA
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Clique para ver insights personalizados sobre suas finanças →
                </p>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label, value, icon, color, positive, negative
}: {
  label: string; value: string; icon: React.ReactNode
  color: string; positive?: boolean; negative?: boolean
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
          {icon}
        </div>
      </div>
      <p style={{
        fontSize: '1.375rem',
        fontWeight: 700,
        color: positive ? 'var(--success)' : negative ? 'var(--danger)' : 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '-0.02em',
      }}>
        {value}
      </p>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-center">
      <p style={{ fontSize: '2rem', marginBottom: 8 }}>📊</p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Sem dados ainda</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-6 text-center">
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{message}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg shimmer" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="h-72 rounded-xl shimmer lg:col-span-2" />
        <div className="h-72 rounded-xl shimmer" />
      </div>
    </div>
  )
}
