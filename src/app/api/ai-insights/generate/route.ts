import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured. Add GEMINI_API_KEY to your .env file.' }, { status: 400 })
    }

    const { start, end } = getCurrentMonthRange()

    // Gather financial data for context
    const [profileRes, txRes, goalsRes, categoryRes] = await Promise.all([
      supabase.from('profiles').select('monthly_income, ai_model').eq('id', user.id).single(),
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
    const aiModel = profileRes.data?.ai_model || 'gemini-3.0-flash-lite'

    const totalIncome = transactions.filter((t) => t.type === 'income').reduce((a, t) => a + parseFloat(String(t.amount)), 0)
    const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + parseFloat(String(t.amount)), 0)
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

    // Call Gemini API
    const geminiSystemPrompt = `# ROLE
Você é um Analista de Dados Financeiros especializado em Finanças Pessoais e Mercado de Capitais Brasileiro (B3). Sua missão é processar extratos e retornar inteligência de economia e alocação.

# CONTEXTO DE ENTRADA
O usuário fornecerá um JSON contendo seus dados financeiros (metas, categorias, transações e saldo).

# REGRAS DE OURO (STRICT RULES)
1. PARCELAMENTOS: Identifique padrões como "X/Y". Trate como compromisso de caixa futuro, NUNCA como erro ou duplicata.
2. ECONOMIA (SAVING): Identifique gastos recorrentes (assinaturas, delivery, taxas bancárias) que podem ser cortados ou renegociados.
3. INVESTIMENTOS (GOAL): Se saldo > 0 e taxa_poupanca_pct > 10%, sugira ativos específicos: Reserva (CDB 100% CDI), Dividendos (BBAS3, KLBN4) ou Renda Fixa (IPCA+).
4. ALERTAS (RISK): Se (gastos > renda) ou (parcelas comprometem > 30% da renda), gere um alerta crítico.

# OUTPUT FORMAT (STRICT JSON ONLY)
Responda exclusivamente com um objeto JSON. Não inclua Markdown, explicações ou texto extra.

{
  "insights": [
    {
      "type": "saving" | "spending" | "goal" | "alert" | "general",
      "title": "Título curto e direto",
      "description": "Explicação técnica e prática de até 200 caracteres.",
      "action": "Ação imediata que o usuário deve tomar.",
      "priority": "high" | "medium" | "low"
    }
  ]
}

# EXEMPLO DE OUTPUT ESPERADO
{
  "insights": [
    {"type": "saving", "title": "Corte de Assinaturas", "description": "Detectado gasto recorrente em 3 streamings.", "action": "Cancele os serviços subutilizados para economizar R$ 80/mês.", "priority": "medium"},
    {"type": "goal", "title": "Aporte em Dividendos", "description": "Saldo excedente de R$ 500 detectado.", "action": "Considere comprar lotes de KLBN4 para focar em renda passiva.", "priority": "high"}
  ]
}`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: geminiSystemPrompt }] },
        contents: [{
          role: 'user',
          parts: [{ text: `Analise meus dados financeiros e gere insights personalizados:\n\n${JSON.stringify(financialSummary, null, 2)}` }]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Gemini error:', err)
      let customError = 'Falha ao se comunicar com a Inteligência Artificial.'
      if (response.status === 401 || response.status === 403) customError = 'Chave de API inválida (GEMINI_API_KEY).'
      if (response.status === 404) customError = 'Modelo de Inteligência Artificial indisponível.'
      if (response.status === 429 || response.status === 503) customError = 'Servidores do Google Gemini estão sobrecarregados (Alta Demanda).'
      return NextResponse.json({ error: customError }, { status: response.status })
    }

    const aiData = await response.json()
    const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let parsed: { insights: Array<{ type: string; title: string; description: string; action: string; priority: string }> }
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
      content: `${ins.description}\n\n📍 Ação Prática: ${ins.action}`,
      priority: ins.priority || 'medium',
      metadata: { source: 'gemini', model: aiModel },
    }))

    const { error: insertError } = await supabase.from('ai_insights').insert(insightsToInsert)
    if (insertError) throw insertError

    return NextResponse.json({ success: true, count: insightsToInsert.length })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
