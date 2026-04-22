'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Transaction, Category, Account } from '@/types'

interface Props {
  transaction: Transaction | null
  categories: Category[]
  accounts: Account[]
  onClose: () => void
  onSave: () => void
}

export default function TransactionModal({ transaction, categories, accounts, onClose, onSave }: Props) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    date: new Date().toISOString().split('T')[0],
    category_id: '',
    account_id: '',
    payment_method: 'other',
    notes: '',
    is_recurring: false,
    is_extraordinary: false,
  })

  useEffect(() => {
    if (transaction) {
      setForm({
        description: transaction.description,
        amount: String(transaction.amount),
        type: transaction.type as 'income' | 'expense' | 'transfer',
        date: transaction.date,
        category_id: transaction.category_id ?? '',
        account_id: transaction.account_id ?? '',
        payment_method: transaction.payment_method ?? 'other',
        notes: transaction.notes ?? '',
        is_recurring: transaction.is_recurring,
        is_extraordinary: transaction.is_extraordinary ?? false,
      })
    }
  }, [transaction])

  const handleSubmit = async () => {
    if (!form.description?.trim()) return toast.error('Informe uma descrição')

    setSaving(true)
    try {
      if (!transaction) return

      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })

      if (!res.ok) throw new Error()
      toast.success('Alterações salvas com sucesso!')
      onSave()
      onClose()
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }))

  // Check if selected category is goal-linked
  const selectedCat = categories.find(c => c.id === form.category_id)
  const isGoalCategory = selectedCat?.name?.startsWith('🎯 Meta:')

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content">
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
            Detalhes e Categoria
          </h2>
          <button className="btn btn-ghost p-1.5" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-3 mb-5 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-subtle)' }}>
           <div>
             <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
               {form.date} · Open Finance
             </p>
             <p style={{ fontSize: '0.9375rem', fontFamily: 'var(--font-mono)', color: form.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                {form.type === 'income' ? '+ Receita' : form.type === 'expense' ? '- Gasto' : '⇄ Transferência'}
             </p>
           </div>
           <div className="text-right">
             <p style={{ fontSize: '1.25rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: form.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
               {form.type === 'income' ? '+' : '-'} R$ {Number(form.amount).toFixed(2).replace('.', ',')}
             </p>
           </div>
        </div>

        {isGoalCategory && (
          <div className="p-3 mb-4 rounded-lg flex items-center gap-2" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <span style={{ fontSize: '1.1rem' }}>🎯</span>
            <p style={{ fontSize: '0.8125rem', color: 'var(--success)' }}>
              <strong>Alocação para Meta.</strong> Este valor será contabilizado como aporte na meta e não como gasto.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label">Descrição Limpa (Aprendizado de IA)</label>
            <input
              className="input"
              placeholder="Ex: Almoço no restaurante"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Categoria</label>
            <select
              className="input"
              value={form.category_id}
              onChange={e => {
                const catId = e.target.value
                set('category_id', catId)
                
                // Auto-set extraordinary if the category is strategic/extraordinary
                const cat = categories.find(c => c.id === catId)
                if (cat?.is_extraordinary) {
                  set('is_extraordinary', true)
                }
              }}
            >
              <option value="">Sem categoria</option>
              <optgroup label="Categorias">
                {categories.filter(c => !c.name?.startsWith('🎯 Meta:')).map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </optgroup>
              {categories.some(c => c.name?.startsWith('🎯 Meta:')) && (
                <optgroup label="🎯 Aportes para Metas">
                  {categories.filter(c => c.name?.startsWith('🎯 Meta:')).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="label">Anotações da compra</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Ex: Presente da tia..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              style={{ resize: 'none' }}
            />
          </div>

          <div className="p-3 rounded-lg" style={{ background: form.is_extraordinary ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-subtle)', border: form.is_extraordinary ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid transparent', transition: 'all 0.2s' }}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_extraordinary}
                onChange={e => set('is_extraordinary', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--warning)' }}
              />
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: form.is_extraordinary ? 'var(--warning)' : 'var(--text-secondary)' }}>
                  <AlertTriangle size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                  Transação extraordinária
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Exclui dos cálculos de média mensal (ex: compra de imóvel, aporte único)
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button className="btn btn-secondary flex-1" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Salvar detalhes
          </button>
        </div>
      </div>
    </>
  )
}
