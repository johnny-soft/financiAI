'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { TrendingUp } from 'lucide-react'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // If already logged in, redirect to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/dashboard'
      }
    })
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        })
        if (error) throw error

        // If email confirmation is disabled, user is auto-confirmed
        if (data.session) {
          // Wait for cookie to be set by @supabase/ssr
          await new Promise(r => setTimeout(r, 500))
          window.location.href = '/dashboard'
          return
        }

        setMessage('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        if (!data.session) throw new Error('Sessão não foi criada. Tente novamente.')

        // Wait for cookie to be set by @supabase/ssr
        await new Promise(r => setTimeout(r, 500))

        // Verify session was actually persisted
        const { data: check } = await supabase.auth.getSession()
        if (!check.session) {
          throw new Error('Sessão não persistiu. Verifique a configuração do Supabase.')
        }

        window.location.href = '/dashboard'
        return
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado'
      // Translate common Supabase errors
      if (message.includes('Invalid login credentials')) {
        setError('E-mail ou senha incorretos')
      } else if (message.includes('Email not confirmed')) {
        setError('E-mail não confirmado. Verifique sua caixa de entrada.')
      } else if (message.includes('User already registered')) {
        setError('Este e-mail já está cadastrado. Tente fazer login.')
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <TrendingUp size={24} color="#fff" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            FinTrack
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
            {isSignUp ? 'Crie sua conta' : 'Entre na sua conta'}
          </p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <form onSubmit={handleSubmit}>
            {isSignUp && (
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="fullName"
                  style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}
                >
                  Nome completo
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  placeholder="Seu nome"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="email"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="password"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}
              >
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                  color: 'var(--danger)',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                {error}
              </div>
            )}

            {message && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--success) 10%, transparent)',
                  color: 'var(--success)',
                  fontSize: '0.8125rem',
                  marginBottom: '1rem',
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '10px', fontSize: '0.875rem' }}
            >
              {loading
                ? (isSignUp ? 'Criando conta…' : 'Entrando…')
                : (isSignUp ? 'Criar conta' : 'Entrar')
              }
            </button>
          </form>
        </div>

        {/* Toggle */}
        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null) }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8125rem',
            }}
          >
            {isSignUp ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </div>
    </div>
  )
}
