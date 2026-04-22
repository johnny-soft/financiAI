'use client'

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Transaction, Category, Account } from '@/types'
import { PAYMENT_METHOD_LABELS } from '@/lib/utils'

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
      })
    }
  }, [transaction])

  const filteredCategories = categories.filter(c =>
    form.type === 'income' ? c.type !== 'expense' : c.type !== 'income'
  )

  const handleSubmit = async () => {
    if (!form.description?.trim()) return toast.error('Informe uma descrição')

    setSaving(true)
    try {
      if (!transaction) return

      const url = `/api/transactions/${transaction.id}`
      const method = 'PUT'

      const res = await fetch(url, {
        method,
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

  return (
    <>
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog-content">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
            Detalhes e Categoria
          </h2>
          <button className="btn btn-ghost p-1.5" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Info Block */}
        <div className="p-3 mb-5 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg-subtle)' }}>
           <div>
             <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Status Oficial: Open Finance</p>
             <p style={{ fontSize: '0.9375rem', fontFamily: 'var(--font-mono)', color: form.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                {form.type === 'income' ? '+ Receita' : form.type === 'expense' ? '- Gasto' : 'Transferência'}
             </p>
           </div>
           <div className="text-right">
             <p style={{ fontSize: '1.25rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: form.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
               {form.type === 'income' ? '+' : '-'} R$ {Number(form.amount).toFixed(2).replace('.', ',')}
             </p>
           </div>
        </div>

        <div className="space-y-4">
          {/* Description */}
          <div>
            <label className="label">Descrição Limpa (Aprendizado de IA)</label>
            <input
              className="input"
              placeholder="Ex: Almoço no restaurante"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Category */}
          <div>
            <label className="label">Categoria</label>
            <select
              className="input"
              value={form.category_id}
              onChange={e => set('category_id', e.target.value)}
            >
              <option value="">Sem categoria</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
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
        </div>

        {/* Actions */}
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
