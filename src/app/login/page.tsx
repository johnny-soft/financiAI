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
  const [debug, setDebug] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()

  const addDebug = (msg: string) => setDebug(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])

  // Check connection on mount
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    addDebug(`SUPABASE_URL: ${url ? url.substring(0, 30) + '...' : 'NOT SET!'}`)
    addDebug(`ANON_KEY: ${key ? key.substring(0, 10) + '...' : 'NOT SET!'}`)

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        addDebug(`getSession error: ${error.message}`)
      } else if (session) {
        addDebug(`Already has session, redirecting...`)
        window.location.href = '/dashboard'
      } else {
        addDebug('No existing session - ready to login')
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    addDebug(`Attempting ${isSignUp ? 'signup' : 'login'} with ${email}`)

    try {
      if (isSignUp) {
        addDebug('Calling signUp...')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        })
        if (error) throw error
        addDebug(`signUp response: session=${!!data.session}, user=${!!data.user}`)

        if (data.session) {
          addDebug('Session created, waiting 500ms...')
          await new Promise(r => setTimeout(r, 500))
          addDebug('Redirecting to /dashboard')
          window.location.href = '/dashboard'
          return
        }

        setMessage('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
      } else {
        addDebug('Calling signInWithPassword...')
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        addDebug(`Login response: session=${!!data.session}, user=${!!data.user}`)

        if (!data.session) throw new Error('Sessão não foi criada. Tente novamente.')

        addDebug('Session created, waiting 500ms...')
        await new Promise(r => setTimeout(r, 500))

        // Verify session was actually persisted
        const { data: check } = await supabase.auth.getSession()
        addDebug(`Session check: ${!!check.session}`)

        addDebug('Redirecting to /dashboard')
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

        {/* Debug Panel - remove after fixing auth */}
        {debug.length > 0 && (
          <div style={{
            marginTop: '1.5rem',
            padding: '12px',
            borderRadius: 8,
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            color: 'var(--text-muted)',
            maxHeight: 200,
            overflowY: 'auto',
          }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>🔍 Debug Log:</p>
            {debug.map((line, i) => (
              <div key={i} style={{ marginBottom: 2 }}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
