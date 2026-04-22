'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { formatCurrency, getMonthName } from '@/lib/utils'
import type { MonthlyBalance, CategorySpending } from '@/types'

interface ReportData {
  monthlyBalance: MonthlyBalance[]
  categorySpending: CategorySpending[]
  totalIncome: number
  totalExpense: number
  avgMonthlyExpense: number
  topExpenseCategory: CategorySpending | null
}

export default function ReportsPage() {
  const router = useRouter()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('6m')

  useEffect(() => {
    setLoading(true)
    setData(null)
    // Cache-bust: append timestamp to force fresh data from the server on every load
    fetch(`/api/reports?range=${range}&_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setData(d.data)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [range])

  const now = new Date()

  return (
    <>
      <div className="animate-fade-in space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Relatórios</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
              Análise do período selecionado
            </p>
          </div>
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-subtle)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {['1d', '7d', '15d', '1m', '3m', '6m'].map(r => (
              <button key={r} onClick={() => setRange(r)} className="btn btn-ghost"
                style={{
                  padding: '5px 14px', fontSize: '0.8125rem', borderRadius: 6,
                  background: range === r ? 'var(--bg-surface)' : 'transparent',
                  color: range === r ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: range === r ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  textTransform: 'uppercase'
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
            </div>
            <div className="h-72 rounded-xl shimmer" />
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="h-72 rounded-xl shimmer" />
              <div className="h-72 rounded-xl shimmer" />
            </div>
          </div>
        ) : !data ? (
          <div className="card-elevated p-12 text-center">
            <p style={{ color: 'var(--text-muted)' }}>Nenhum dado disponível ainda.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label="Total Receitas" value={formatCurrency(data.totalIncome)} color="var(--success)" emoji="📈" />
              <SummaryCard label="Total Gastos" value={formatCurrency(data.totalExpense)} color="var(--danger)" emoji="📉" />
              <SummaryCard label="Saldo Período" value={formatCurrency(data.totalIncome - data.totalExpense)} color="var(--accent)" emoji="💰" />
              <SummaryCard label="Média Mensal Gastos" value={formatCurrency(data.avgMonthlyExpense)} color="var(--warning)" emoji="📊" />
            </div>

            {/* Monthly bar chart */}
            <div className="card-elevated p-5">
              <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 20 }}>Receitas vs Gastos por Mês</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.monthlyBalance} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={v => { const [, m] = v.split('-'); return getMonthName(Number(m), true) }}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatCurrency(v), name === 'income' ? 'Receitas' : 'Gastos']}
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                  />
                  <Legend formatter={v => v === 'income' ? 'Receitas' : 'Gastos'} wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  <Bar dataKey="income" fill="var(--success)" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Bar dataKey="expense" fill="var(--danger)" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Line + Pie */}
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Balance line */}
              <div className="card-elevated p-5">
                <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 20 }}>Evolução do Saldo</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.monthlyBalance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={v => { const [, m] = v.split('-'); return getMonthName(Number(m), true) }}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatCurrency(v), 'Saldo']}
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                    />
                    <Line
                      type="monotone" dataKey="balance" stroke="var(--accent)"
                      strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Category pie */}
              <div className="card-elevated p-5">
                <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 16 }}>Distribuição de Gastos</h2>
                {data.categorySpending.filter(c => c.total > 0).length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={data.categorySpending.filter(c => c.total > 0).slice(0, 8)}
                          dataKey="total"
                          nameKey="category_name"
                          cx="50%" cy="50%"
                          innerRadius={40} outerRadius={70}
                          paddingAngle={3}
                        >
                          {data.categorySpending.filter(c => c.total > 0).slice(0, 8).map((cat, i) => (
                            <Cell key={i} fill={cat.category_color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number, name: string) => [formatCurrency(v), name]}
                          contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {data.categorySpending.filter(c => c.total > 0).slice(0, 6).map((cat, i) => {
                        const pct = data.totalExpense > 0 ? Math.round((cat.total / data.totalExpense) * 100) : 0
                        return (
                          <div key={i} className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => router.push(`/transactions?category=${cat.category_id}`)} title="Ver transações">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.category_color }} />
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', flex: 1 }}>
                              {cat.category_icon} {cat.category_name}
                            </span>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{pct}%</span>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: 80, textAlign: 'right' }}>
                              {formatCurrency(cat.total)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-40">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sem dados de gastos</p>
                  </div>
                )}
              </div>
            </div>

            {/* Top expense banner */}
            {data.topExpenseCategory && (
              <div
                className="card p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/5 transition-colors"
                onClick={() => router.push(`/transactions?category=${data.topExpenseCategory?.category_id}`)}
                title="Ver transações desta categoria"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'var(--bg-subtle)' }}>
                    {data.topExpenseCategory.category_icon}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Maior gasto: {data.topExpenseCategory.category_name}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      {formatCurrency(data.topExpenseCategory.total)} no período ·{' '}
                      {data.totalExpense > 0 ? Math.round((data.topExpenseCategory.total / data.totalExpense) * 100) : 0}% do total de gastos
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--accent)' }}>Ver tudo →</span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function SummaryCard({ label, value, color, emoji }: { label: string; value: string; color: string; emoji: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <span>{emoji}</span>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
      </div>
      <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem', color, letterSpacing: '-0.02em' }}>
        {value}
      </p>
    </div>
  )
}
