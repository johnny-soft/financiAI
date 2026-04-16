import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured. Add ANTHROPIC_API_KEY to your .env file.' }, { status: 400 })
    }

    const { start, end } = getCurrentMonthRange()

    // Gather financial data for context
    const [profileRes, txRes, goalsRes, categoryRes] = await Promise.all([
      supabase.from('profiles').select('monthly_income').eq('id', user.id).single(),
      supabase.from('transactions')
        .select('amount, type, date, description, category:categories(name)')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
        .limit(100),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
    ])

    const transactions = txRes.data ?? []
    const goals = goalsRes.data ?? []
    const categories = (categoryRes.data ?? []).filter((c: { total: number }) => c.total > 0)
    const monthlyIncome = profileRes.data?.monthly_income ?? 0

    const totalIncome = transactions.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0)
    const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : '0'

    const financialSummary = {
      periodo: `${start} a ${end}`,
      renda_configurada: monthlyIncome,
      receitas_mes: totalIncome,
      gastos_mes: totalExpense,
      saldo_mes: totalIncome - totalExpense,
      taxa_poupanca_pct: savingsRate,
      gastos_por_categoria: categories.slice(0, 8).map((c: { category_name: string; total: number }) => ({
        categoria: c.category_name,
        total: c.total,
      })),
      metas_ativas: goals.map(g => ({
        titulo: g.title,
        meta: g.target_amount,
        atual: g.current_amount,
        progresso_pct: g.target_amount > 0 ? ((g.current_amount / g.target_amount) * 100).toFixed(0) : 0,
        prazo: g.target_date,
      })),
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        system: `Você é um consultor financeiro pessoal especializado em finanças pessoais no Brasil.
Analise os dados financeiros fornecidos e gere exatamente 4 insights práticos e personalizados.
Responda APENAS com um JSON válido, sem markdown, no seguinte formato:
{
  "insights": [
    {
      "type": "saving|spending|goal|alert|general",
      "title": "Título curto e direto (máx 60 chars)",
      "content": "Explicação prática e acionável em português (2-3 frases)",
      "priority": "high|medium|low"
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `Analise meus dados financeiros e gere insights personalizados:\n\n${JSON.stringify(financialSummary, null, 2)}`,
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: 'AI API error' }, { status: 500 })
    }

    const aiData = await response.json()
    const text = aiData.content?.[0]?.text ?? ''

    let parsed: { insights: Array<{ type: string; title: string; content: string; priority: string }> }
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Save insights to DB
    const insightsToInsert = (parsed.insights ?? []).map((ins) => ({
      user_id: user.id,
      type: ins.type || 'general',
      title: ins.title,
      content: ins.content,
      priority: ins.priority || 'medium',
      metadata: { source: 'anthropic', model: 'claude-opus-4-6' },
    }))

    const { error: insertError } = await supabase.from('ai_insights').insert(insightsToInsert)
    if (insertError) throw insertError

    return NextResponse.json({ success: true, count: insightsToInsert.length })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
