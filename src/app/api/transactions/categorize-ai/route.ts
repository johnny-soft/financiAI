import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured. Add GEMINI_API_KEY to your .env file.' }, { status: 400 })
    }

    // Try to parse body for specific IDs, otherwise fetch uncategorized
    let transactionIdsToCategorize: string[] = []
    try {
      const body = await req.json()
      if (body.transactionIds && Array.isArray(body.transactionIds)) {
        transactionIdsToCategorize = body.transactionIds
      }
    } catch {
      // Ignore if no body
    }

    // 1. Fetch transactions to categorize
    let txQuery = supabase
      .from('transactions')
      .select('id, description, amount, type, date')
      .eq('user_id', user.id)
      .is('category_id', null)
      .order('date', { ascending: false })
      .limit(50)

    if (transactionIdsToCategorize.length > 0) {
      txQuery = txQuery.in('id', transactionIdsToCategorize)
    }

    const { data: transactions, error: txError } = await txQuery

    if (txError) throw txError
    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, categorizedCount: 0, message: 'Nenhuma transação sem categoria encontrada.' })
    }

    // 2. Fetch user's categories, global context (monthly spending & investments), and explicit manual memory
    const { start, end } = getCurrentMonthRange()
    const [categoriesRes, globalSpendingRes, investmentAccountsRes, profileRes, manualMemRes] = await Promise.all([
      supabase.from('categories').select('id, name, type').eq('user_id', user.id),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
      supabase.from('accounts').select('name, balance').eq('user_id', user.id).eq('type', 'investment'),
      supabase.from('profiles').select('ai_model').eq('id', user.id).single(),
      supabase.from('transactions').select('description, category_id').eq('user_id', user.id).contains('metadata', { manual_category: true }).order('updated_at', { ascending: false }).limit(30)
    ])

    const aiModel = profileRes.data?.ai_model || 'gemini-3.0-flash-lite'

    const categories = categoriesRes.data ?? []
    if (categories.length === 0) {
      return NextResponse.json({ error: 'Nenhuma categoria configurada no perfil do usuário.' }, { status: 400 })
    }

    const monthlySpending = (globalSpendingRes.data ?? []).filter((c: { total: number }) => c.total > 0)
      .map((c: { category_name: string, total: number }) => ({ cat: c.category_name, total: c.total }))
    const investments = investmentAccountsRes.data ?? []

    // 3. Prepare payload for Gemini (Data Packing via Minified JSON)
    const packedCategories = JSON.stringify(categories.map(c => ({ i: c.id, n: c.name, t: c.type })))
    const packedTransactions = JSON.stringify(transactions.map(t => ({ i: t.id, d: t.description, v: t.amount, t: t.type })))
    const packedContext = JSON.stringify({ spending: monthlySpending, investments })
    
    // Process User AI Memory (Feedback loop)
    const manualRules = (manualMemRes.data || []).filter(t => t.description && t.category_id).map(t => ({ d: t.description, c_id: t.category_id }))
    const packedRules = manualRules.length > 0 ? JSON.stringify(manualRules) : '[]'

    const systemInstruction = `# ROLE
Você é um Analista de Dados Financeiros e Estrategista de Alocação. Sua função é processar transações e converter dados brutos em inteligência de portfólio.

# TASK 01: CLASSIFICAÇÃO
Mapeie cada item em [TRANSACOES A CLASSIFICAR] para o "c_id" (ID da Categoria) correspondente em [CATEGORIAS].
- MEMÓRIA DO USUÁRIO: Use as [REGRAS_MANUAIS] sempre que a transação for similar ao Histórico do Usuário. Prioridade Absoluta.
- PARCELAMENTOS: Identifique padrões como "1/12". Trate como fluxo de caixa comprometido, NUNCA como erro.
- DUPLICATAS: Aponte apenas se Valor, Nome e Data forem idênticos no mesmo dia.

# TASK 02: INSIGHTS DE ALOCAÇÃO E ECONOMIA
Analise o [CONTEXTO GERAL] e o lote atual. Gere até 3 insights seguindo estes critérios:
1. RESERVA: Se não houver reserva de emergência, priorize liquidez diária (CDB/Tesouro Selic).
2. DIVIDENDOS: Se houver saldo livre, sugira aportes em setores perenes da B3 (Bancário, Elétrico, Saneamento ou Commodities) focando em Dividend Yield.
3. EFICIÊNCIA: Identifique picos de gastos em categorias não-essenciais que prejudicam a capacidade de aporte.

# OUTPUT CONSTRAINT (STRICT JSON ONLY)
Responda exclusivamente com o JSON abaixo. Sem textos explicativos.

{
  "classifications": [
    { "t_id": "ID_DA_TRANSACAO", "c_id": "ID_DA_CATEGORIA" }
  ],
  "insights": [
    { 
      "type": "alert|goal|saving", 
      "sector": "Setor Sugerido ou N/A",
      "msg": "Texto analítico de até 150 caracteres." 
    }
  ]
}
`

    const userPrompt = `CATEGORIAS: ${packedCategories}\n\nREGRAS_MANUAIS (HISTÓRICO DO USUÁRIO):\n${packedRules}\n\nCONTEXTO GERAL (Gastos do mês e Saldo Investimentos):\n${packedContext}\n\nTRANSACOES A CLASSIFICAR:\n${packedTransactions}`

    // 4. Call Gemini API using selected model
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API Error:', errText)
      return NextResponse.json({ error: 'Falha na API da IA' }, { status: 500 })
    }

    const aiData = await response.json()
    const textContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // 5. Parse and update DB
    let parsed: { 
      classifications: Array<{ transaction_id?: string; category_id?: string; t_id?: string; c_id?: string }>,
      insights?: Array<{ type: string; title?: string; msg?: string; sector?: string; description?: string; action?: string; content?: string; priority?: string }>
    }
    try {
      const cleanJson = textContent.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleanJson)
    } catch (parseErr) {
      console.error('Falha ao parsear JSON da IA:', textContent)
      return NextResponse.json({ error: 'Formato inválido retornado pela IA' }, { status: 500 })
    }

    // 5.1 Atualizar Transações
    let updatedCount = 0
    for (const item of parsed.classifications || []) {
      const txId = item.transaction_id || item.t_id
      const catId = item.category_id || item.c_id
      if (!txId || !catId) continue
      const { error: updateErr } = await supabase
        .from('transactions').update({ category_id: catId })
        .eq('id', txId).eq('user_id', user.id)
      if (!updateErr) updatedCount++
    }

    // 5.2 Salvar Insights (Se gerados)
    if (parsed.insights && parsed.insights.length > 0) {
      const insightsToInsert = parsed.insights.map((ins) => ({
        user_id: user.id,
        type: ['saving', 'spending', 'goal', 'alert', 'general'].includes(ins.type) ? ins.type : 'general',
        title: ins.title || (ins.sector && ins.sector !== 'N/A' ? `Estratégia: ${ins.sector}` : 'Visão Analítica'),
        content: ins.msg || (ins.description && ins.action ? `${ins.description}\n\n📍 Ação Prática: ${ins.action}` : (ins.content || '')),
        priority: ins.priority || 'medium',
        metadata: { source: 'gemini-auto', model: aiModel },
      }))
      await supabase.from('ai_insights').insert(insightsToInsert)
    }

    return NextResponse.json({ 
      success: true, 
      categorizedCount: updatedCount,
      transactionsAttempted: transactions.length,
      insightsGenerated: parsed.insights?.length || 0
    })

  } catch (err) {
    console.error('AI Categorization Error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
