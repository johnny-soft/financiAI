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
    // RECOMPOSITION INDEX (Emergency Reserve Health)
    // ========================================
    const { data: reserveAccounts } = await supabase
      .from('accounts')
      .select('balance, type')
      .eq('user_id', user.id)
      .in('type', ['savings', 'investment'])

    const totalReserve = (reserveAccounts ?? []).reduce((a, acc) => a + parseFloat(String(acc.balance ?? 0)), 0)
    const idealReserve = totalExpense * 6 // 6 months of expenses
    const recompositionIndex = idealReserve > 0 ? Math.round((totalReserve / idealReserve) * 100) : 100
    const reserveHealthy = recompositionIndex >= 100

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
        saldo_atual: totalReserve,
        meta_ideal: Math.round(idealReserve),
        indice_recomposicao_pct: recompositionIndex,
        status: reserveHealthy ? 'SAUDÁVEL' : 'EM RECOMPOSIÇÃO',
      },
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

    // Call Gemini API — CFO-grade prompt with dynamic personality
    const geminiSystemPrompt = `# ROLE
Você é um Consultor Financeiro Pessoal e CFO (Chief Financial Officer) especializado em otimização de renda, economia e investimentos no Brasil (B3). Sua missão é transformar transações brutas em inteligência de governança financeira.
${personalityModifier}

# TASK: GERAÇÃO DE 4 INSIGHTS DE NEGÓCIO (STRICT RULES)
Analise os dados financeiros fornecidos para gerar exatamente 4 insights práticos:
1. SAVING (Foco em Consumo): Identifique gastos supérfluos ou recorrências que podem ser cortadas.
2. PATRIMÔNIO (Foco em Ativos): Se houver aquisições extraordinárias (como terrenos), valide a conversão de liquidez em patrimônio imobilizado. NÃO classifique como "Gasto Excessivo".
3. LIQUIDEZ (Foco em Risco): Avalie se o uso de reservas para metas ou ativos comprometeu a margem de segurança (mínimo 6x o custo fixo).
4. GOAL (Foco em B3): Se houver saldo operacional, sugira alocação em setores perenes (Bancos, Energia, Saneamento) visando Dividend Yield, citando a estratégia de ativos como BBAS3 ou KLBN4 apenas como exemplo de setor.

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
