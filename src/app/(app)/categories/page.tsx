'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import type { Category } from '@/types'

const ICONS = ['💰', '🍔', '🚗', '🏠', '❤️', '📚', '🎮', '👕', '📱', '📈', '💸', '💼', '💻', '📊', '✨', '🎯', '✈️', '🛒', '🎬', '⚡']
const COLORS = ['#6366f1', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#10b981', '#6b7280', '#0ea5e9', '#a78bfa', '#fb923c']

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💰')
  const [color, setColor] = useState('#6366f1')
  const [type, setType] = useState<'income' | 'expense' | 'both'>('expense')

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories')
    const json = await res.json()
    setCategories(json.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const resetForm = () => {
    setName(''); setIcon('💰'); setColor('#6366f1'); setType('expense')
    setShowForm(false); setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (editingId) {
      await fetch('/api/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name, icon, color, type }),
      })
    } else {
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon, color, type }),
      })
    }
    resetForm()
    fetchCategories()
  }

  const handleEdit = (cat: Category) => {
    setName(cat.name); setIcon(cat.icon); setColor(cat.color); setType(cat.type)
    setEditingId(cat.id); setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta categoria?')) return
    await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
    fetchCategories()
  }

  const incomeCategories = categories.filter(c => c.type === 'income' || c.type === 'both')
  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both')

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg shimmer" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Categorias</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 2 }}>
            {categories.length} categorias cadastradas
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { resetForm(); setShowForm(true) }}
        >
          <Plus size={16} />
          Nova categoria
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '1rem' }}>
            {editingId ? 'Editar categoria' : 'Nova categoria'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome da categoria"
                required
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <select
                value={type}
                onChange={e => setType(e.target.value as 'income' | 'expense' | 'both')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="both">Ambos</option>
              </select>
            </div>

            {/* Icon picker */}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Ícone</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.75rem' }}>
              {ICONS.map(i => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIcon(i)}
                  style={{
                    width: 36, height: 36, borderRadius: 8, fontSize: '1.1rem',
                    border: icon === i ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: icon === i ? 'var(--accent-muted)' : 'var(--bg-base)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {i}
                </button>
              ))}
            </div>

            {/* Color picker */}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Cor</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '1rem' }}>
              {COLORS.map(c => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none',
                    background: c, cursor: 'pointer',
                    outline: color === c ? '2px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Salvar' : 'Criar'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expense categories */}
      <div>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          💸 Despesas ({expenseCategories.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
          {expenseCategories.map(cat => (
            <CategoryCard key={cat.id} cat={cat} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      </div>

      {/* Income categories */}
      <div>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          💰 Receitas ({incomeCategories.length})
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
          {incomeCategories.map(cat => (
            <CategoryCard key={cat.id} cat={cat} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    </div>
  )
}

function CategoryCard({
  cat, onEdit, onDelete,
}: {
  cat: Category
  onEdit: (cat: Category) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      className="card"
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${cat.color}18`, fontSize: '1.1rem',
          }}
        >
          {cat.icon}
        </div>
        <div>
          <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{cat.name}</p>
          <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
            {cat.type === 'income' ? 'Receita' : cat.type === 'both' ? 'Ambos' : 'Despesa'}
            {cat.is_default && ' · Padrão'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="btn btn-ghost"
          onClick={() => onEdit(cat)}
          style={{ padding: 6 }}
          title="Editar categoria"
        >
          <Pencil size={14} />
        </button>
        {!cat.is_default && (
          <button
            className="btn btn-ghost"
            onClick={() => onDelete(cat.id)}
            style={{ padding: 6, color: 'var(--danger)' }}
            title="Excluir categoria"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
