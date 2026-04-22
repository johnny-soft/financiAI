'use client'

import { useState, useEffect } from 'react'
import { Sparkles, RefreshCw, CheckCheck, X, TrendingUp, AlertTriangle, PiggyBank, Lightbulb, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { AIInsight } from '@/types'
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
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Erro interno na comunicação com o servidor.')
      }
      toast.success('Novos insights gerados!')
      load()
    } catch (err: any) {
      toast.error(err.message || 'Falha ao gerar insights.')
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
    <>
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
          <div className="space-y-8 mt-2">
            {/* High priority first */}
            {(['high', 'medium', 'low'] as const).map(priority => {
              const group = activeInsights.filter(i => i.priority === priority)
              if (group.length === 0) return null
              return (
                <div key={priority} className="animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="section-title" style={{ margin: 0 }}>{PRIORITY_LABELS[priority]}</p>
                    <span className="badge" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>{group.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
    </>
  )
}

function InsightCard({ insight, onDismiss, onRead }: {
  insight: AIInsight
  onDismiss: () => void
  onRead: () => void
}) {
  const color = INSIGHT_COLORS[insight.type] || 'var(--accent)'
  const icon = INSIGHT_ICONS[insight.type] || <Sparkles size={20} />

  return (
    <div
      className="card-elevated p-6 transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden flex flex-col h-full"
      style={{
        opacity: insight.is_read ? 0.65 : 1,
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-card)',
        cursor: !insight.is_read ? 'pointer' : 'default',
        boxShadow: insight.is_read ? '0 2px 8px rgba(0,0,0,0.02)' : `0 8px 30px -8px color-mix(in srgb, ${color} 25%, transparent)`,
      }}
      onClick={!insight.is_read ? onRead : undefined}
    >
      {/* Decorative Side Bar */}
      <div 
        className="absolute top-0 left-0 w-1 h-full transition-opacity duration-300" 
        style={{ background: color, opacity: insight.is_read ? 0.3 : 1 }} 
      />
      
      {/* Glow Effect for Unread */}
      {!insight.is_read && (
        <div 
          className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-[0.15] pointer-events-none transition-opacity group-hover:opacity-25" 
          style={{ background: color }} 
        />
      )}

      <div className="flex flex-col h-full pl-2">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
          >
            {icon}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!insight.is_read ? (
              <span className="badge animate-pulse" style={{ background: color, color: '#fff', fontSize: '0.65rem', padding: '3px 8px', letterSpacing: '0.02em' }}>NOVO</span>
            ) : null}
            <button 
              className="btn btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity" 
              style={{ color: 'var(--text-muted)' }} 
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              title="Ocultar dica"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        
        <p style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.5rem', lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {insight.title}
        </p>
        
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6, flexGrow: 1, marginBottom: '1.25rem' }}>
          {insight.content}
        </p>
        
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-dashed" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <span className="badge" style={{ background: `color-mix(in srgb, ${color} 6%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`, fontWeight: 600 }}>
              {insight.type === 'saving' ? 'Economia' : insight.type === 'spending' ? 'Alerta de Consumo' : insight.type === 'goal' ? 'Meta Financeira' : insight.type === 'alert' ? 'Atenção Necessária' : 'Visão Geral'}
            </span>
          </div>
          <div className="flex items-center gap-2">
             {insight.is_read && (
              <span title="Marcado como lido" style={{ color: 'var(--success)' }}>
                <CheckCheck size={15} />
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {formatDate(insight.generated_at, 'dd/MM/yyyy')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
