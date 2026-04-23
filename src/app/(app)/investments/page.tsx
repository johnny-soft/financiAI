'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp, Shield, PlusCircle, Loader2, X,
  ArrowUpRight, BarChart3, Briefcase, Landmark
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate, percentageOf } from '@/lib/utils'
import type { Investment, Goal } from '@/types'

interface InvestmentSummary {
  totalInvested: number
  totalTaxes: number
  totalNet: number
  count: number
  byType: Record<string, { total: number; count: number }>
  avgMonthlyExpense: number
}

const TYPE_ICONS: Record<string, string> = {
  'Renda Fixa': '🏦',
  'Fundos': '📊',
  'Renda Variável': '📈',
  'ETF': '🔄',
  'COE': '🎯',
  'Outros': '💼',
}

const TYPE_COLORS: Record<string, string> = {
  'Renda Fixa': '#6366f1',
  'Fundos': '#8b5cf6',
  'Renda Variável': '#10b981',
  'ETF': '#f59e0b',
  'COE': '#ec4899',
  'Outros': '#64748b',
}

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [emergencyReserves, setEmergencyReserves] = useState<Goal[]>([])
  const [summary, setSummary] = useState<InvestmentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContribute, setShowContribute] = useState<Goal | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/investments?_t=${Date.now()}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.data) {
        setInvestments(json.data.investments ?? [])
        setEmergencyReserves(json.data.emergencyReserves ?? [])
        setSummary(json.data.summary ?? null)
      }
    } catch {
      toast.error('Erro ao carregar investimentos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Group investments by type
  const grouped: Record<string, Investment[]> = {}
  for (const inv of investments) {
    if (!grouped[inv.type]) grouped[inv.type] = []
    grouped[inv.type].push(inv)
  }

  return (
    <>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Investimentos</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
              Patrimônio investido e reservas de emergência
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl shimmer" />)}
            </div>
            <div className="h-52 rounded-xl shimmer" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-xl shimmer" />)}
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            {summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <SummaryCard
                  label="Total Investido"
                  value={formatCurrency(summary.totalInvested)}
                  icon={<Briefcase size={18} />}
                  color="var(--accent)"
                />
                <SummaryCard
                  label="Valor Líquido"
                  value={formatCurrency(summary.totalNet)}
                  icon={<TrendingUp size={18} />}
                  color="var(--success)"
                />
                <SummaryCard
                  label="IR Provisionado"
                  value={formatCurrency(summary.totalTaxes)}
                  icon={<BarChart3 size={18} />}
                  color="var(--warning)"
                />
                <SummaryCard
                  label="Ativos"
                  value={String(summary.count)}
                  icon={<Landmark size={18} />}
                  color="var(--text-secondary)"
                />
              </div>
            )}

            {/* Emergency Reserve Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={18} style={{ color: 'var(--success)' }} />
                <p className="section-title" style={{ margin: 0 }}>Reserva de Emergência</p>
              </div>

              {emergencyReserves.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {emergencyReserves.map(goal => {
                    const pct = percentageOf(goal.current_amount, goal.target_amount)
                    const monthsCovered = summary && summary.avgMonthlyExpense > 0
                      ? (goal.current_amount / summary.avgMonthlyExpense)
                      : 0

                    return (
                      <div key={goal.id} className="card-elevated p-5 relative overflow-hidden">
                        {/* Accent gradient */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                          background: pct >= 100
                            ? 'linear-gradient(90deg, var(--success), #34d399)'
                            : 'linear-gradient(90deg, var(--accent), #818cf8)',
                        }} />

                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                              style={{ background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
                              🛡️
                            </div>
                            <div>
                              <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{goal.title}</p>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {monthsCovered >= 1
                                  ? `≈ ${monthsCovered.toFixed(1)} meses de despesas`
                                  : 'Construindo sua reserva...'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>
                              {formatCurrency(goal.current_amount)}
                            </span>
                            <span style={{
                              fontSize: '0.8125rem', fontWeight: 600,
                              color: pct >= 100 ? 'var(--success)' : 'var(--accent)',
                            }}>
                              {pct}%
                            </span>
                          </div>
                          <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'var(--bg-subtle)' }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                background: pct >= 100 ? 'var(--success)' : 'var(--accent)',
                              }}
                            />
                          </div>
                          <div className="flex justify-between mt-1.5">
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Meta: {formatCurrency(goal.target_amount)}
                            </span>
                            {pct < 100 && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Faltam {formatCurrency(goal.target_amount - goal.current_amount)}
                              </span>
                            )}
                          </div>
                        </div>

                        {pct < 100 ? (
                          <button
                            className="btn btn-secondary w-full text-sm"
                            onClick={() => setShowContribute(goal)}
                          >
                            <PlusCircle size={14} /> Adicionar aporte
                          </button>
                        ) : (
                          <div className="text-center py-1" style={{ color: 'var(--success)', fontSize: '0.875rem', fontWeight: 600 }}>
                            ✅ Reserva completa!
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="card-elevated p-8 text-center">
                  <p style={{ fontSize: '2rem', marginBottom: 8 }}>🛡️</p>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 4 }}>
                    Nenhuma reserva de emergência
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: 16 }}>
                    Vá em Metas e crie uma meta com categoria "Emergência" para acompanhar aqui.
                  </p>
                </div>
              )}
            </div>

            {/* Investment Distribution Bar */}
            {summary && Object.keys(summary.byType).length > 0 && (
              <div className="card-elevated p-5">
                <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 16 }}>Distribuição por Classe</h2>
                <div className="flex rounded-lg overflow-hidden" style={{ height: 12 }}>
                  {Object.entries(summary.byType).map(([type, data]) => {
                    const pct = summary.totalInvested > 0 ? (data.total / summary.totalInvested) * 100 : 0
                    return (
                      <div
                        key={type}
                        title={`${type}: ${formatCurrency(data.total)} (${pct.toFixed(1)}%)`}
                        style={{
                          width: `${pct}%`,
                          background: TYPE_COLORS[type] || '#64748b',
                          minWidth: pct > 0 ? 4 : 0,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
                  {Object.entries(summary.byType).map(([type, data]) => {
                    const pct = summary.totalInvested > 0 ? (data.total / summary.totalInvested) * 100 : 0
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[type] || '#64748b' }} />
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          {type}
                        </span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Investments by Type */}
            {Object.keys(grouped).length > 0 ? (
              Object.entries(grouped).map(([type, invs]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: '1.1rem' }}>{TYPE_ICONS[type] || '💼'}</span>
                    <p className="section-title" style={{ margin: 0 }}>{type}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      ({invs.length} ativo{invs.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {invs.map(inv => (
                      <InvestmentCard key={inv.id} investment={inv} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="card-elevated p-12 text-center">
                <p style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</p>
                <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>
                  Nenhum investimento encontrado
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Conecte uma conta de investimentos via Pluggy para visualizar seus ativos aqui.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Contribute Modal */}
      {showContribute && (
        <ContributeModal
          goal={showContribute}
          onClose={() => setShowContribute(null)}
          onSave={load}
        />
      )}
    </>
  )
}

function SummaryCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode; color: string
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          {icon}
        </div>
      </div>
      <p style={{
        fontSize: '1.375rem', fontWeight: 700,
        fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em',
        color: 'var(--text-primary)',
      }}>
        {value}
      </p>
    </div>
  )
}

function InvestmentCard({ investment: inv }: { investment: Investment }) {
  return (
    <div className="card-elevated p-4 flex flex-col gap-2.5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p style={{ fontWeight: 600, fontSize: '0.875rem' }} className="truncate" title={inv.name}>
            {inv.name}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600, padding: '1px 6px',
              background: `color-mix(in srgb, ${TYPE_COLORS[inv.type] || '#64748b'} 15%, transparent)`,
              color: TYPE_COLORS[inv.type] || '#64748b',
              borderRadius: 4,
            }}>
              {inv.subtype}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {inv.institution}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <span style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem',
        }}>
          {formatCurrency(inv.amount)}
        </span>
        {inv.taxes > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            IR: {formatCurrency(inv.taxes)}
          </span>
        )}
      </div>

      {/* Rates */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {inv.lastMonthRate !== null && inv.lastMonthRate !== 0 && (
          <div className="flex items-center gap-1">
            <ArrowUpRight size={12} style={{ color: inv.lastMonthRate > 0 ? 'var(--success)' : 'var(--danger)' }} />
            <span style={{ fontSize: '0.75rem', color: inv.lastMonthRate > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
              {(inv.lastMonthRate * 100).toFixed(2)}% mês
            </span>
          </div>
        )}
        {inv.last12mRate !== null && inv.last12mRate !== 0 && (
          <div className="flex items-center gap-1">
            <ArrowUpRight size={12} style={{ color: inv.last12mRate > 0 ? 'var(--success)' : 'var(--danger)' }} />
            <span style={{ fontSize: '0.75rem', color: inv.last12mRate > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 500 }}>
              {(inv.last12mRate * 100).toFixed(2)}% 12m
            </span>
          </div>
        )}
        {inv.annualRate !== null && inv.annualRate > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {(inv.annualRate * 100).toFixed(1)}% a.a.
          </span>
        )}
      </div>

      {inv.date && (
        <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
          Ref: {formatDate(inv.date)}
        </p>
      )}
    </div>
  )
}

function ContributeModal({ goal, onClose, onSave }: { goal: Goal; onClose: () => void; onSave: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount))) return toast.error('Informe um valor válido')
    setSaving(true)
    try {
      const res = await fetch(`/api/goals/${goal.id}/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), note }),
      })
      if (!res.ok) throw new Error()
      toast.success('Aporte registrado!')
      onSave(); onClose()
    } catch {
      toast.error('Erro ao registrar aporte')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content" style={{ maxWidth: 360 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>Aporte na Reserva</h2>
          <button className="btn btn-ghost p-1.5" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          🛡️ {goal.title} · Faltam {formatCurrency(goal.target_amount - goal.current_amount)}
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Valor (R$) *</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0,00" value={amount}
              onChange={e => setAmount(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} autoFocus />
          </div>
          <div>
            <label className="label">Observação</label>
            <input className="input" placeholder="Opcional" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button className="btn btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary flex-1" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Confirmar aporte
          </button>
        </div>
      </div>
    </>
  )
}
