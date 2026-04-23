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
        .neq('type', 'transfer')
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
    const monthlyIncome = parseFloat(String(profileRes.data?.monthly_income ?? 0))
    const aiModel = profileRes.data?.ai_model || 'gemini-3.0-flash-lite'

    const totalIncome = transactions.filter((t) => t.type === 'income').reduce((a, t) => a + parseFloat(String(t.amount)), 0)
    const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((a, t) => a + parseFloat(String(t.amount)), 0)
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : '0'

    // ========================================
    // EMERGENCY RESERVE (from goals table)
    // ========================================
    const emergencyGoals = goals.filter(g => g.category === 'emergency')
    const emergencyReserveTotal = emergencyGoals.reduce((a, g) => a + parseFloat(String(g.current_amount ?? 0)), 0)
    const emergencyReserveTarget = emergencyGoals.reduce((a, g) => a + parseFloat(String(g.target_amount ?? 0)), 0)

    // Also consider savings/investment account balances as part of reserve
    const { data: reserveAccounts } = await supabase
      .from('accounts')
      .select('balance, type')
      .eq('user_id', user.id)
      .in('type', ['savings', 'investment'])

    const accountReserveBalance = (reserveAccounts ?? []).reduce((a, acc) => a + parseFloat(String(acc.balance ?? 0)), 0)
    const totalReserve = Math.max(emergencyReserveTotal, accountReserveBalance)
    const idealReserve = totalExpense > 0 ? totalExpense * 6 : monthlyIncome * 6 // 6 months
    const recompositionIndex = idealReserve > 0 ? Math.round((totalReserve / idealReserve) * 100) : 100
    const reserveHealthy = recompositionIndex >= 100

    // ========================================
    // INVESTMENTS (from Pluggy via accounts)
    // ========================================
    const { data: investmentAccounts } = await supabase
      .from('accounts')
      .select('name, balance, institution, type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('type', ['investment', 'savings'])

    const investmentSummary = (investmentAccounts ?? []).map(acc => ({
      nome: acc.name,
      instituicao: acc.institution,
      tipo: acc.type,
      saldo: parseFloat(String(acc.balance ?? 0)),
    }))
    const totalInvested = investmentSummary.reduce((a, i) => a + i.saldo, 0)

    // Dynamic AI personality based on reserve health
    let personalityModifier = ''
    if (recompositionIndex < 30) {
      personalityModifier = '\n⚠️ MODO CRÍTICO: A reserva de emergência está em nível crítico (abaixo de 30%). Seja EXTREMAMENTE rigoroso. Priorize cortes agressivos em lazer, assinaturas e consumo supérfluo. Toda sugestão de investimento em renda variável deve ser VETADA até a recomposição do caixa.'
    } else if (recompositionIndex < 60) {
      personalityModifier = '\n⚠️ MODO CAUTELOSO: A reserva está abaixo do ideal (< 60%). Priorize liquidez diária (CDB/Tesouro Selic) sobre ações. Sugira redução moderada de gastos não-essenciais.'
    } else if (recompositionIndex < 100) {
      personalityModifier = '\nMODO EQUILIBRADO: A reserva está em construção. Mantenha aportes em renda fixa e sugira diversificação apenas do excedente.'
    } else {
      personalityModifier = '\nMODO EXPANSÃO: Reserva de emergência atingida. Libere sugestões de diversificação em renda variável (B3) e fundos imobiliários.'
    }

    const financialSummary = {
      periodo: `${start} a ${end}`,
      renda_configurada: monthlyIncome,
      receitas_mes: totalIncome,
      gastos_mes: totalExpense,
      saldo_mes: totalIncome - totalExpense,
      taxa_poupanca_pct: savingsRate,
      reserva_emergencia: {
        saldo_meta: emergencyReserveTotal,
        meta_total: emergencyReserveTarget,
        saldo_contas_reserva: accountReserveBalance,
        total_liquido: totalReserve,
        meta_ideal_6m: Math.round(idealReserve),
        indice_recomposicao_pct: recompositionIndex,
        status: reserveHealthy ? 'SAUDÁVEL' : 'EM RECOMPOSIÇÃO',
      },
      investimentos: {
        total_investido: totalInvested,
        contas: investmentSummary,
      },
      gastos_por_categoria: categories.slice(0, 8).map((c: { category_name: string; total: number }) => ({
        categoria: c.category_name,
        total: c.total,
      })),
      metas_ativas: goals.map(g => ({
        titulo: g.title,
        categoria: g.category,
        meta: g.target_amount,
        atual: g.current_amount,
        progresso_pct: g.target_amount > 0 ? ((g.current_amount / g.target_amount) * 100).toFixed(0) : 0,
        prazo: g.target_date,
      })),
    }

    // Call Gemini API — CFO-grade prompt with dynamic personality
    const geminiSystemPrompt = `# ROLE
Você é um Consultor Financeiro Pessoal e CFO (Chief Financial Officer) especializado em otimização de renda, economia e investimentos no Brasil (B3). Sua missão é transformar transações brutas em inteligência de governança financeira.
${personalityModifier}

# DADOS DISPONÍVEIS
Os dados incluem:
- Transações do mês (receitas e gastos operacionais)
- Gastos por categoria
- Metas financeiras ativas (incluindo reserva de emergência com categoria "emergency")
- Investimentos: contas de investimento com saldo, instituição e tipo
- Reserva de emergência: saldo atual da meta, meta ideal (6x despesa mensal), índice de recomposição

# TASK: GERAÇÃO DE 4 INSIGHTS DE NEGÓCIO (STRICT RULES)
Analise TODOS os dados financeiros (transações, investimentos, reserva de emergência, metas) para gerar exatamente 4 insights:

1. SAVING (Foco em Consumo): Identifique gastos supérfluos ou recorrências que podem ser cortadas.
2. INVESTIMENTOS / PATRIMÔNIO (Foco em Portfólio): Analise a composição dos investimentos. Se houver concentração em uma classe, sugira diversificação. Avalie a distribuição entre renda fixa e variável. Se houver aquisições extraordinárias (como terrenos), valide a conversão de liquidez em patrimônio imobilizado.
3. RESERVA DE EMERGÊNCIA (Foco em Risco): Analise o índice de recomposição. Se a reserva está abaixo de 6 meses de despesa, calcule quanto falta e sugira um aporte mensal para atingir a meta em X meses. Se já atingiu, parabenize e sugira próximos passos.
4. GOAL (Foco em B3): Se houver saldo operacional E a reserva estiver saudável, sugira alocação em setores perenes (Bancos, Energia, Saneamento) visando Dividend Yield. Se a reserva NÃO estiver completa, sugira renda fixa com liquidez diária (Tesouro Selic, CDB DI).

# DIRETRIZES FUNDAMENTAIS DE ANÁLISE:
- PARCELAMENTOS: Identifique "X/12". NUNCA trate como duplicata ou erro. É compromisso de caixa futuro.
- DUPLICATAS: Apenas se Valor, Nome e Data forem idênticos no mesmo dia.
- TAXA DE POUPANÇA: Diferencie "Poupança Real" (Receita - Consumo) de "Saldo em Conta".
- METAS: Se houver metas ativas com aportes, considere-os como movimentação estratégica, não como gasto.
- EXTRAORDINÁRIOS: Diferencie eventos únicos (compra de imóvel, bônus salarial) da rotina mensal.

# OUTPUT FORMAT (STRICT JSON ONLY)
Responda exclusivamente com um objeto JSON. Não inclua Markdown, explicações ou texto extra.

{
  "kpis": {
    "savings_rate_real_pct": number,
    "liquidity_coverage_months": number
  },
  "insights": [
    {
      "type": "saving" | "spending" | "goal" | "alert" | "general",
      "title": "Título curto e direto",
      "description": "Explicação técnica e prática de até 200 caracteres.",
      "action": "Ação imediata que o usuário deve tomar.",
      "priority": "high" | "medium" | "low"
    }
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
          parts: [{ text: `Analise meus dados financeiros e gere insights de governança:\n\n${JSON.stringify(financialSummary, null, 2)}` }]
        }],
        generationConfig: {
          temperature: 0.15,
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

    let parsed: { kpis?: { savings_rate_real_pct?: number; liquidity_coverage_months?: number }; insights: Array<{ type: string; title: string; description?: string; msg?: string; action?: string; priority: string }> }
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    // Limpar insights anteriores (Flush)
    await supabase.from('ai_insights').delete().eq('user_id', user.id)

    // Save insights to DB
    const insightsToInsert = (parsed.insights ?? []).map((ins) => ({
      user_id: user.id,
      type: ins.type || 'general',
      title: ins.title || 'Insight',
      content: `${ins.description || ins.msg || ''}\n\n📍 Ação Prática: ${ins.action || '—'}`,
      priority: ins.priority || 'medium',
      metadata: {
        source: 'gemini',
        model: aiModel,
        kpis: parsed.kpis ?? {},
      },
    }))

    const { error: insertError } = await supabase.from('ai_insights').insert(insightsToInsert)
    if (insertError) throw insertError

    return NextResponse.json({ success: true, count: insightsToInsert.length, kpis: parsed.kpis })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
