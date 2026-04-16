'use client'

import { useState, useEffect } from 'react'
import { Plus, Target, Pencil, Trash2, PlusCircle, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatDate, percentageOf, GOAL_CATEGORY_LABELS } from '@/lib/utils'
import type { Goal } from '@/types'
import AppLayout from '@/components/AppLayout'

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/goals').then(r => r.json())
    setGoals(res.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta meta?')) return
    await fetch(`/api/goals/${id}`, { method: 'DELETE' })
    toast.success('Meta excluída')
    load()
  }

  const activeGoals = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Metas Financeiras</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
              {activeGoals.length} ativa{activeGoals.length !== 1 ? 's' : ''} · {completedGoals.length} concluída{completedGoals.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditGoal(null); setShowModal(true) }}>
            <Plus size={16} /> Nova meta
          </button>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-52 rounded-xl shimmer" />)}
          </div>
        ) : goals.length === 0 ? (
          <div className="card-elevated p-16 text-center">
            <p style={{ fontSize: '3rem', marginBottom: 12 }}>🎯</p>
            <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>Nenhuma meta definida</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
              Crie metas financeiras para acompanhar seu progresso
            </p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Criar primeira meta
            </button>
          </div>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <div>
                <p className="section-title">Ativas</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeGoals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onEdit={() => { setEditGoal(goal); setShowModal(true) }}
                      onDelete={() => handleDelete(goal.id)}
                      onContribute={() => setContributeGoal(goal)}
                    />
                  ))}
                </div>
              </div>
            )}
            {completedGoals.length > 0 && (
              <div>
                <p className="section-title">Concluídas</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedGoals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onEdit={() => { setEditGoal(goal); setShowModal(true) }}
                      onDelete={() => handleDelete(goal.id)}
                      onContribute={() => setContributeGoal(goal)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <GoalModal
          goal={editGoal}
          onClose={() => setShowModal(false)}
          onSave={load}
        />
      )}

      {contributeGoal && (
        <ContributeModal
          goal={contributeGoal}
          onClose={() => setContributeGoal(null)}
          onSave={load}
        />
      )}
    </AppLayout>
  )
}

function GoalCard({ goal, onEdit, onDelete, onContribute }: {
  goal: Goal
  onEdit: () => void
  onDelete: () => void
  onContribute: () => void
}) {
  const pct = percentageOf(goal.current_amount, goal.target_amount)
  const remaining = goal.target_amount - goal.current_amount
  const isComplete = goal.status === 'completed' || pct >= 100

  return (
    <div className="card-elevated p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'var(--bg-subtle)' }}>
            {goal.icon}
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{goal.title}</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {GOAL_CATEGORY_LABELS[goal.category] ?? goal.category}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost p-1.5" onClick={onEdit}><Pencil size={13} /></button>
          <button className="btn btn-ghost p-1.5" style={{ color: 'var(--danger)' }} onClick={onDelete}><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>
            {formatCurrency(goal.current_amount)}
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isComplete ? 'var(--success)' : 'var(--text-muted)' }}>
            {pct}%
          </span>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'var(--bg-subtle)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: isComplete ? 'var(--success)' : 'var(--accent)',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Meta: {formatCurrency(goal.target_amount)}
          </span>
          {!isComplete && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Faltam {formatCurrency(remaining)}
            </span>
          )}
        </div>
      </div>

      {goal.target_date && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          📅 Prazo: {formatDate(goal.target_date)}
        </p>
      )}

      {!isComplete && (
        <button className="btn btn-secondary w-full text-sm" onClick={onContribute}>
          <PlusCircle size={14} /> Adicionar aporte
        </button>
      )}

      {isComplete && (
        <div className="text-center py-1" style={{ color: 'var(--success)', fontSize: '0.875rem', fontWeight: 600 }}>
          ✅ Meta concluída!
        </div>
      )}
    </div>
  )
}

function GoalModal({ goal, onClose, onSave }: { goal: Goal | null; onClose: () => void; onSave: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    icon: goal?.icon ?? '🎯',
    target_amount: goal ? String(goal.target_amount) : '',
    current_amount: goal ? String(goal.current_amount) : '0',
    target_date: goal?.target_date ?? '',
    category: goal?.category ?? 'other',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.title.trim()) return toast.error('Informe um título')
    if (!form.target_amount) return toast.error('Informe o valor da meta')
    setSaving(true)
    try {
      const url = goal ? `/api/goals/${goal.id}` : '/api/goals'
      const method = goal ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_amount: Number(form.target_amount), current_amount: Number(form.current_amount) }),
      })
      if (!res.ok) throw new Error()
      toast.success(goal ? 'Meta atualizada!' : 'Meta criada!')
      onSave(); onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const ICONS = ['🎯', '✈️', '🏠', '🚗', '💍', '📚', '💻', '🏋️', '🌴', '💰', '📈', '🎓']

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content">
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
            {goal ? 'Editar meta' : 'Nova meta'}
          </h2>
          <button className="btn btn-ghost p-1.5" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Ícone</label>
            <div className="flex flex-wrap gap-2">
              {ICONS.map(icon => (
                <button key={icon} onClick={() => set('icon', icon)}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={{ background: form.icon === icon ? 'var(--accent-muted)' : 'var(--bg-subtle)', border: form.icon === icon ? '2px solid var(--accent)' : '2px solid transparent' }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Título *</label>
            <input className="input" placeholder="Ex: Viagem para Europa" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor da meta (R$) *</label>
              <input className="input" type="number" min="0" step="0.01" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div>
              <label className="label">Valor atual (R$)</label>
              <input className="input" type="number" min="0" step="0.01" value={form.current_amount} onChange={e => set('current_amount', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
                {Object.entries(GOAL_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Prazo</label>
              <input className="input" type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button className="btn btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary flex-1" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {goal ? 'Salvar' : 'Criar meta'}
          </button>
        </div>
      </div>
    </>
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
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>Registrar aporte</h2>
          <button className="btn btn-ghost p-1.5" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          {goal.icon} {goal.title} · Faltam {formatCurrency(goal.target_amount - goal.current_amount)}
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Valor (R$) *</label>
            <input className="input" type="number" min="0" step="0.01" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} autoFocus />
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
