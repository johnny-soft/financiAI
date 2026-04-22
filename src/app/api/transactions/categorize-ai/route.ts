import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured. Add ANTHROPIC_API_KEY to your .env file.' }, { status: 400 })
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

    // 2. Fetch user's categories
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', user.id)

    if (catError) throw catError
    if (!categories || categories.length === 0) {
      return NextResponse.json({ error: 'Nenhuma categoria configurada no perfil do usuário.' }, { status: 400 })
    }

    // 3. Prepare payload for Anthropic
    const categoriesText = categories.map(c => `- ID: ${c.id} | Nome: ${c.name} | Tipo: ${c.type}`).join('\n')
    const transactionsText = transactions.map(t => `- ID: ${t.id} | Desc: ${t.description} | R$: ${t.amount} | Tipo: ${t.type} | Data: ${t.date}`).join('\n')

    const prompt = `Você é um assistente financeiro especializado em categorizar transações no Brasil.
Eu lhe darei uma lista de categorias disponíveis e uma lista de transações não categorizadas.
Sua tarefa é analisar a "Descrição" (Desc) de cada transação, considerar o valor e o "Tipo" (income/expense), e atribuir o ID da categoria que melhor se encaixa da lista fornecida.

REGRAS:
1. Responda ESTRITAMENTE e APENAS com um JSON puro no formato especificado abaixo.
2. Não inclua texto antes nem depois do JSON. Não envolva com \`\`\`json.
3. Se não encontrar uma categoria que se encaixe perfeitamente, tente usar uma genérica do mesmo tipo (como "Outros gastos") ou a que mais se assemelhar logicamente.

FORMATO DE RESPOSTA ESPERADO:
{
  "classifications": [
    { "transaction_id": "ID da transação aqui", "category_id": "ID da categoria que você escolheu" }
  ]
}

CATEGORIAS DISPONÍVEIS:
${categoriesText}

TRANSAÇÕES A CLASSIFICAR:
${transactionsText}
`

    // 4. Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1500,
        temperature: 0.1,
        system: "Você é uma API de processamento de dados JSON. Responda apenas com JSON.",
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API Error:', errText)
      return NextResponse.json({ error: 'Falha na API da IA' }, { status: 500 })
    }

    const aiData = await response.json()
    const textContent = aiData.content?.[0]?.text ?? ''

    // 5. Parse and update DB
    let parsed: { classifications: Array<{ transaction_id: string; category_id: string }> }
    try {
      const cleanJson = textContent.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleanJson)
    } catch (parseErr) {
      console.error('Falha ao parsear JSON da IA:', textContent)
      return NextResponse.json({ error: 'Formato inválido retornado pela IA' }, { status: 500 })
    }

    let updatedCount = 0
    // Lote simples de atualizações
    for (const item of parsed.classifications || []) {
      if (!item.transaction_id || !item.category_id) continue
      
      const { error: updateErr } = await supabase
        .from('transactions')
        .update({ category_id: item.category_id })
        .eq('id', item.transaction_id)
        .eq('user_id', user.id) // security check

      if (!updateErr) updatedCount++
    }

    return NextResponse.json({ 
      success: true, 
      categorizedCount: updatedCount,
      transactionsAttempted: transactions.length
    })

  } catch (err) {
    console.error('AI Categorization Error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
