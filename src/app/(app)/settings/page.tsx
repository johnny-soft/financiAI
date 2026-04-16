'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, CreditCard, Save, User, Moon, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface Profile {
  full_name: string
  monthly_income: number
  currency: string
}

interface BankAccount {
  id: string
  name: string
  institution: string | null
  type: string
  closing_day: number | null
  due_day: number | null
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile>({ full_name: '', monthly_income: 0, currency: 'BRL' })
  const [creditCards, setCreditCards] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [profileRes, accountsRes] = await Promise.all([
      supabase.from('profiles').select('full_name, monthly_income, currency').eq('id', user.id).single(),
      supabase.from('accounts').select('id, name, institution, type, closing_day, due_day').eq('user_id', user.id).eq('is_active', true),
    ])

    if (profileRes.data) {
      setProfile({
        full_name: profileRes.data.full_name || '',
        monthly_income: parseFloat(String(profileRes.data.monthly_income)) || 0,
        currency: profileRes.data.currency || 'BRL',
      })
    }

    // Show all accounts — let user configure billing cycle on any of them
    const allAccounts = accountsRes.data ?? []
    setCreditCards(allAccounts.map(a => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      closing_day: a.closing_day ?? null,
      due_day: a.due_day ?? null,
    })))
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleSaveProfile = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').update({
      full_name: profile.full_name,
      monthly_income: profile.monthly_income,
      currency: profile.currency,
    }).eq('id', user.id)

    if (error) {
      toast.error('Erro ao salvar perfil')
    } else {
      toast.success('Perfil salvo com sucesso!')
    }
    setSaving(false)
  }

  const handleSaveCard = async (card: BankAccount) => {
    const { error } = await supabase.from('accounts').update({
      closing_day: card.closing_day,
      due_day: card.due_day,
      type: card.type,
    }).eq('id', card.id)

    if (error) {
      toast.error(`Erro ao salvar ${card.name}`)
    } else {
      toast.success(`${card.name} atualizado!`)
    }
  }

  const updateCard = (id: string, field: 'closing_day' | 'due_day', value: string) => {
    const num = value === '' ? null : parseInt(value)
    setCreditCards(prev => prev.map(c => c.id === id ? { ...c, [field]: num } : c))
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg shimmer" />
        <div className="h-48 rounded-xl shimmer" />
        <div className="h-48 rounded-xl shimmer" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
          <Settings size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom' }} />
          Configurações
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
          Configure seu perfil e contas bancárias
        </p>
      </div>

      {/* Profile Section */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={16} />
          Perfil
        </h2>

        <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
          <div>
            <label style={labelStyle}>Nome completo</label>
            <input
              value={profile.full_name}
              onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
              style={inputStyle}
              placeholder="Seu nome"
            />
          </div>

          <div>
            <label style={labelStyle}>Renda mensal (R$)</label>
            <input
              type="number"
              value={profile.monthly_income || ''}
              onChange={e => setProfile(p => ({ ...p, monthly_income: parseFloat(e.target.value) || 0 }))}
              style={inputStyle}
              placeholder="0.00"
              step="0.01"
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveProfile}
            disabled={saving}
            style={{ width: 'fit-content', gap: 6 }}
          >
            <Save size={14} />
            {saving ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </div>
      </div>

      {/* Credit Card Settings */}
      {creditCards.length > 0 && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={16} />
            Contas Bancárias
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
            Configure o tipo da conta e o dia de fechamento/vencimento dos cartões de crédito.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {creditCards.map(card => (
              <div
                key={card.id}
                style={{
                  padding: '1rem',
                  borderRadius: 12,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'var(--bg-surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8125rem', fontWeight: 700,
                    }}
                  >
                    {card.institution?.[0] ?? '💳'}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{card.name}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{card.institution ?? 'Conta bancária'}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 160 }}>
                    <label style={labelStyle}>Tipo da conta</label>
                    <select
                      value={card.type}
                      onChange={e => setCreditCards(prev => prev.map(c => c.id === card.id ? { ...c, type: e.target.value } : c))}
                      style={inputStyle}
                    >
                      <option value="checking">Conta corrente</option>
                      <option value="savings">Poupança</option>
                      <option value="credit">Cartão de crédito</option>
                      <option value="investment">Investimento</option>
                      <option value="wallet">Carteira</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>

                  {card.type === 'credit' && (
                    <>
                      <div style={{ minWidth: 120 }}>
                        <label style={labelStyle}>Dia fechamento</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={card.closing_day ?? ''}
                          onChange={e => updateCard(card.id, 'closing_day', e.target.value)}
                          style={inputStyle}
                          placeholder="Ex: 15"
                        />
                      </div>
                      <div style={{ minWidth: 120 }}>
                        <label style={labelStyle}>Dia vencimento</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={card.due_day ?? ''}
                          onChange={e => updateCard(card.id, 'due_day', e.target.value)}
                          style={inputStyle}
                          placeholder="Ex: 25"
                        />
                      </div>
                    </>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={() => handleSaveCard(card)}
                    style={{ height: 36, gap: 6 }}
                  >
                    <Save size={14} />
                    Salvar
                  </button>
                </div>

                {card.type === 'credit' && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 8 }}>
                    💡 O fechamento define o período da fatura. Ex: fechamento dia 15 → a fatura de abril vai do dia 16/mar ao dia 15/abr.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {creditCards.length === 0 && (
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <CreditCard size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Nenhum cartão de crédito encontrado. Sincronize suas contas via Pluggy para configurar.
          </p>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontSize: '0.875rem',
  outline: 'none',
}
