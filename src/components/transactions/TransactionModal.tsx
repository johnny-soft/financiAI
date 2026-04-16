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
    if (!form.description.trim()) return toast.error('Informe uma descrição')
    if (!form.amount || isNaN(Number(form.amount))) return toast.error('Informe um valor válido')

    setSaving(true)
    try {
      const url = transaction ? `/api/transactions/${transaction.id}` : '/api/transactions'
      const method = transaction ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })

      if (!res.ok) throw new Error()
      toast.success(transaction ? 'Transação atualizada!' : 'Transação criada!')
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
            {transaction ? 'Editar transação' : 'Nova transação'}
          </h2>
          <button className="btn btn-ghost p-1.5" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 p-1 rounded-lg mb-5" style={{ background: 'var(--bg-subtle)' }}>
          {(['expense', 'income', 'transfer'] as const).map(t => (
            <button
              key={t}
              onClick={() => set('type', t)}
              className="flex-1 btn"
              style={{
                padding: '7px',
                fontSize: '0.8125rem',
                background: form.type === t ? 'var(--bg-surface)' : 'transparent',
                color: form.type === t
                  ? t === 'income' ? 'var(--success)' : t === 'expense' ? 'var(--danger)' : 'var(--text-primary)'
                  : 'var(--text-muted)',
                boxShadow: form.type === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                borderRadius: 6,
                fontWeight: form.type === t ? 600 : 400,
              }}
            >
              {t === 'income' ? '+ Receita' : t === 'expense' ? '− Gasto' : '⇄ Transferência'}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {/* Description */}
          <div>
            <label className="label">Descrição *</label>
            <input
              className="input"
              placeholder="Ex: Almoço no restaurante"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$) *</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div>
              <label className="label">Data *</label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
              />
            </div>
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

          {/* Account + Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Conta</label>
              <select
                className="input"
                value={form.account_id}
                onChange={e => set('account_id', e.target.value)}
              >
                <option value="">Nenhuma</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Método</label>
              <select
                className="input"
                value={form.payment_method}
                onChange={e => set('payment_method', e.target.value)}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Observações</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Detalhes opcionais…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              style={{ resize: 'none' }}
            />
          </div>

          {/* Recurring */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={e => set('is_recurring', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Transação recorrente
            </span>
          </label>
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
            {transaction ? 'Salvar alterações' : 'Criar transação'}
          </button>
        </div>
      </div>
    </>
  )
}
