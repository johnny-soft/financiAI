import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

/**
 * Normalize a transaction description for hash-map lookup.
 * Strips numbers, store IDs, installment patterns, collapses whitespace.
 */
function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d+\/\d+/g, '')           // remove installment patterns (1/12)
    .replace(/\b\d{3,}\b/g, '')          // remove long numbers (store IDs)
    .replace(/[*#\-_.]+/g, ' ')          // remove special chars
    .replace(/\s+/g, ' ')               // collapse whitespace
    .trim()
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured. Add GEMINI_API_KEY to your .env file.' }, { status: 400 })
    }

    // Parse optional body for specific IDs
    let transactionIdsToCategorize: string[] = []
    try {
      const body = await req.json()
      if (body.transactionIds && Array.isArray(body.transactionIds)) {
        transactionIdsToCategorize = body.transactionIds
      }
    } catch {
      // No body
    }

    // 1. Fetch uncategorized transactions
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

    // ========================================
    // PHASE 1: CACHE LOOKUP (Hash Map)
    // ========================================
    const cachedResults: Array<{ txId: string; categoryId: string }> = []
    const uncachedTransactions: typeof transactions = []

    // Build normalized keys for all transactions
    const normalizedMap = new Map<string, typeof transactions[0][]>()
    for (const tx of transactions) {
      const key = normalizeDescription(tx.description)
      if (!normalizedMap.has(key)) normalizedMap.set(key, [])
      normalizedMap.get(key)!.push(tx)
    }

    // Batch lookup in hash map
    const normalizedKeys = [...normalizedMap.keys()]
    const { data: cachedMappings } = await supabase
      .from('category_hash_map')
      .select('description_normalized, category_id')
      .eq('user_id', user.id)
      .in('description_normalized', normalizedKeys)

    const cacheHits = new Map((cachedMappings ?? []).map(m => [m.description_normalized, m.category_id]))

    for (const [key, txs] of normalizedMap.entries()) {
      if (cacheHits.has(key)) {
        for (const tx of txs) {
          cachedResults.push({ txId: tx.id, categoryId: cacheHits.get(key)! })
        }
      } else {
        uncachedTransactions.push(...txs)
      }
    }

    // Apply cached results immediately (no AI needed!)
    let cachedCount = 0
    for (const { txId, categoryId } of cachedResults) {
      const { error } = await supabase
        .from('transactions').update({ category_id: categoryId })
        .eq('id', txId).eq('user_id', user.id)
      if (!error) cachedCount++
    }

    // Increment hit_count for used cache entries
    if (cachedResults.length > 0) {
      const hitKeys = [...new Set(cachedResults.map(r => {
        const tx = transactions.find(t => t.id === r.txId)
        return tx ? normalizeDescription(tx.description) : null
      }).filter(Boolean))]

      for (const key of hitKeys) {
        await supabase.rpc('increment_hash_hit', { p_user_id: user.id, p_key: key as string }).catch(() => {
          // RPC may not exist yet, ignore
        })
      }
    }

    // If everything was cached, return early!
    if (uncachedTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        categorizedCount: cachedCount,
        cachedCount,
        aiCount: 0,
        message: `${cachedCount} transações classificadas instantaneamente via cache!`
      })
    }

    // ========================================
    // PHASE 2: AI CLASSIFICATION (only unknowns)
    // ========================================
    const { start, end } = getCurrentMonthRange()
    const [categoriesRes, globalSpendingRes, profileRes, manualMemRes] = await Promise.all([
      supabase.from('categories').select('id, name, type').eq('user_id', user.id),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
      supabase.from('profiles').select('ai_model').eq('id', user.id).single(),
      supabase.from('transactions').select('description, category_id').eq('user_id', user.id).contains('metadata', { manual_category: true }).order('updated_at', { ascending: false }).limit(30)
    ])

    const aiModel = profileRes.data?.ai_model || 'gemini-3.0-flash-lite'
    const categories = categoriesRes.data ?? []
    if (categories.length === 0) {
      return NextResponse.json({ error: 'Nenhuma categoria configurada.' }, { status: 400 })
    }

    const monthlySpending = (globalSpendingRes.data ?? []).filter((c: { total: number }) => c.total > 0)
      .map((c: { category_name: string, total: number }) => ({ cat: c.category_name, total: c.total }))

    const manualRules = (manualMemRes.data || []).filter(t => t.description && t.category_id).map(t => ({ d: t.description, c_id: t.category_id }))

    const packedCategories = JSON.stringify(categories.map(c => ({ i: c.id, n: c.name, t: c.type })))
    const packedTransactions = JSON.stringify(uncachedTransactions.map(t => ({ i: t.id, d: t.description, v: t.amount, t: t.type })))
    const packedContext = JSON.stringify({ spending: monthlySpending })
    const packedRules = manualRules.length > 0 ? JSON.stringify(manualRules) : '[]'

    const systemInstruction = `# ROLE
Você é um Classificador de Dados Financeiros. Classifique cada transação na categoria mais adequada.

# REGRAS
- Use [REGRAS_MANUAIS] como prioridade absoluta para transações similares.
- PARCELAMENTOS (X/12): Fluxo de caixa comprometido, NUNCA erro.
- DUPLICATAS: Apenas se Valor, Nome e Data forem idênticos.

# OUTPUT (STRICT JSON ONLY)
{
  "classifications": [
    { "t_id": "ID_DA_TRANSACAO", "c_id": "ID_DA_CATEGORIA" }
  ]
}`

    const userPrompt = `CATEGORIAS: ${packedCategories}\n\nREGRAS_MANUAIS:\n${packedRules}\n\nCONTEXTO:\n${packedContext}\n\nTRANSACOES:\n${packedTransactions}`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.05, responseMimeType: "application/json" }
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API Error:', errText)
      return NextResponse.json({ error: 'Falha na API da IA', cachedCount }, { status: 500 })
    }

    const aiData = await response.json()
    const textContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let parsed: { classifications: Array<{ t_id?: string; c_id?: string; transaction_id?: string; category_id?: string }> }
    try {
      parsed = JSON.parse(textContent.replace(/```json|```/g, '').trim())
    } catch {
      console.error('AI parse error:', textContent)
      return NextResponse.json({ error: 'Formato inválido da IA', cachedCount }, { status: 500 })
    }

    // Apply AI results and SAVE TO CACHE
    let aiCount = 0
    const newCacheEntries: Array<{ user_id: string; description_normalized: string; category_id: string }> = []

    for (const item of parsed.classifications || []) {
      const txId = item.t_id || item.transaction_id
      const catId = item.c_id || item.category_id
      if (!txId || !catId) continue

      const { error: updateErr } = await supabase
        .from('transactions').update({ category_id: catId })
        .eq('id', txId).eq('user_id', user.id)

      if (!updateErr) {
        aiCount++
        // Find the original transaction to cache it
        const tx = uncachedTransactions.find(t => t.id === txId)
        if (tx) {
          const key = normalizeDescription(tx.description)
          if (key.length > 2) {
            newCacheEntries.push({
              user_id: user.id,
              description_normalized: key,
              category_id: catId,
            })
          }
        }
      }
    }

    // Batch insert new cache entries (ignore duplicates via upsert)
    if (newCacheEntries.length > 0) {
      await supabase
        .from('category_hash_map')
        .upsert(newCacheEntries, { onConflict: 'user_id,description_normalized' })
    }

    return NextResponse.json({
      success: true,
      categorizedCount: cachedCount + aiCount,
      cachedCount,
      aiCount,
      message: cachedCount > 0
        ? `⚡ ${cachedCount} via cache instantâneo + ${aiCount} via IA Gemini`
        : `${aiCount} transações classificadas pela IA`,
    })

  } catch (err) {
    console.error('AI Categorization Error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
