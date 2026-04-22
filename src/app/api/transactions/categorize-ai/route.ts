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

    // 2. Fetch user's categories, global context (monthly spending & investments)
    const { start, end } = getCurrentMonthRange()
    const [categoriesRes, globalSpendingRes, investmentAccountsRes] = await Promise.all([
      supabase.from('categories').select('id, name, type').eq('user_id', user.id),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
      supabase.from('accounts').select('name, balance').eq('user_id', user.id).eq('type', 'investment')
    ])

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

    const systemInstruction = `Você é um analista financeiro rigoroso. Sua dupla missão:
1. Categorizar transações (classifications): Para cada iten em 'TRANSACOES', classifique usando 'CATEGORIAS' (i=ID, n=Nome, t=Tipo). Ache as mais lógicas.
2. Gerar Insights (insights): Avalie o 'CONTEXTO GERAL' (com gastos mensais e saldos de investimento) E o lote recebido. Responda com até 3 insights fortes e aplicáveis focados em PADRÕES DE GASTOS ou GESTÃO DE INVESTIMENTOS/RESERVA.

Responda ESTRITAMENTE e APENAS com este JSON puro:
{
  "classifications": [ { "transaction_id": "i", "category_id": "i" } ],
  "insights": [ { "type": "spending|saving|investment|alert", "title": "max 60 chars", "content": "Dica direta aplicável", "priority": "high|medium|low" } ]
}`

    const userPrompt = `CATEGORIAS: ${packedCategories}\n\nCONTEXTO GERAL (Gastos do mês e Saldo Investimentos):\n${packedContext}\n\nTRANSACOES A CLASSIFICAR:\n${packedTransactions}`

    // 4. Call Gemini 3.0 Flash API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent?key=${apiKey}`, {
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
      classifications: Array<{ transaction_id: string; category_id: string }>,
      insights?: Array<{ type: string; title: string; content: string; priority: string }>
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
      if (!item.transaction_id || !item.category_id) continue
      const { error: updateErr } = await supabase
        .from('transactions').update({ category_id: item.category_id })
        .eq('id', item.transaction_id).eq('user_id', user.id)
      if (!updateErr) updatedCount++
    }

    // 5.2 Salvar Insights (Se gerados)
    if (parsed.insights && parsed.insights.length > 0) {
      const insightsToInsert = parsed.insights.map((ins) => ({
        user_id: user.id,
        type: ['saving', 'spending', 'goal', 'alert', 'general'].includes(ins.type) ? ins.type : 'general',
        title: ins.title,
        content: ins.content,
        priority: ins.priority || 'medium',
        metadata: { source: 'gemini-auto', model: 'gemini-3.0-flash' },
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
