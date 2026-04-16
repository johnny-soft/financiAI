'use client'

import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, CheckCheck, X, TrendingUp, AlertTriangle, PiggyBank, Lightbulb, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AIInsight } from '@/types'
import AppLayout from '@/components/AppLayout'
import { formatDate } from '@/lib/utils'

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  saving: <PiggyBank size={16} />,
  spending: <TrendingUp size={16} />,
  goal: <Lightbulb size={16} />,
  alert: <AlertTriangle size={16} />,
  general: <Sparkles size={16} />,
}

const INSIGHT_COLORS: Record<string, string> = {
  saving: 'var(--success)',
  spending: 'var(--accent)',
  goal: 'var(--warning)',
  alert: 'var(--danger)',
  general: 'var(--accent)',
}

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Alta prioridade',
  medium: 'Média prioridade',
  low: 'Baixa prioridade',
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/ai-insights').then(r => r.json())
    setInsights(res.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai-insights/generate', { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('Novos insights gerados!')
      load()
    } catch {
      toast.error('Erro ao gerar insights. Verifique se a API de IA está configurada.')
    } finally {
      setGenerating(false)
    }
  }

  const handleDismiss = async (id: string) => {
    await fetch(`/api/ai-insights/${id}/dismiss`, { method: 'POST' })
    setInsights(prev => prev.filter(i => i.id !== id))
  }

  const handleMarkRead = async (id: string) => {
    await fetch(`/api/ai-insights/${id}/read`, { method: 'POST' })
    setInsights(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i))
  }

  const activeInsights = insights.filter(i => !i.is_dismissed)
  const unread = activeInsights.filter(i => !i.is_read)

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">IA Financeira</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
              Recomendações personalizadas para suas finanças
              {unread.length > 0 && <span className="ml-2 badge income-badge">{unread.length} nova{unread.length > 1 ? 's' : ''}</span>}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {generating ? 'Analisando…' : 'Gerar insights'}
          </button>
        </div>

        {/* Info banner */}
        <div
          className="card p-4 flex items-start gap-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)', background: 'var(--accent-muted)' }}
        >
          <Sparkles size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--accent)' }}>
              Como funciona
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>
              A IA analisa suas transações, categorias, metas e padrões de gasto para gerar recomendações personalizadas.
              Configure sua chave de API (Claude ou OpenAI) em <strong>Configurações → IA</strong> e clique em "Gerar insights" para começar.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-xl shimmer" />)}
          </div>
        ) : activeInsights.length === 0 ? (
          <div className="card-elevated p-16 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4"
              style={{ background: 'var(--accent-muted)' }}>
              🤖
            </div>
            <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>Nenhum insight ainda</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20, maxWidth: 360, margin: '0 auto 20px' }}>
              Configure sua chave de API em Configurações e clique em "Gerar insights" para receber recomendações personalizadas.
            </p>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Gerar meus primeiros insights
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* High priority first */}
            {(['high', 'medium', 'low'] as const).map(priority => {
              const group = activeInsights.filter(i => i.priority === priority)
              if (group.length === 0) return null
              return (
                <div key={priority}>
                  <p className="section-title">{PRIORITY_LABELS[priority]}</p>
                  <div className="space-y-3">
                    {group.map(insight => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onDismiss={() => handleDismiss(insight.id)}
                        onRead={() => handleMarkRead(insight.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function InsightCard({ insight, onDismiss, onRead }: {
  insight: AIInsight
  onDismiss: () => void
  onRead: () => void
}) {
  const color = INSIGHT_COLORS[insight.type]
  const icon = INSIGHT_ICONS[insight.type]

  return (
    <div
      className="card-elevated p-5 transition-all"
      style={{
        opacity: insight.is_read ? 0.75 : 1,
        borderLeft: `3px solid ${color}`,
      }}
      onClick={!insight.is_read ? onRead : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{insight.title}</p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!insight.is_read && (
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              )}
              <button className="btn btn-ghost p-1" style={{ color: 'var(--text-muted)' }} onClick={(e) => { e.stopPropagation(); onDismiss() }}>
                <X size={13} />
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {insight.content}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <span className="badge" style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color, fontSize: '0.72rem' }}>
              {insight.type === 'saving' ? 'Economia' : insight.type === 'spending' ? 'Gastos' : insight.type === 'goal' ? 'Meta' : insight.type === 'alert' ? 'Alerta' : 'Geral'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {formatDate(insight.generated_at, 'dd/MM/yyyy')}
            </span>
            {insight.is_read && (
              <span className="flex items-center gap-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <CheckCheck size={12} /> Lido
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
