import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/transactions/detect-transfers
 * 
 * Scans the user's transactions for "twin" transfers:
 * 1. Same amount (one income, one expense)
 * 2. Within 2 days of each other (to account for weekends/processing)
 * 3. OPTIONAL: Same CPF on payer and receiver (strongest signal)
 * 
 * Transactions detected as self-transfers are reclassified as type='transfer'
 * so they don't inflate income/expense totals.
 */
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch all non-transfer transactions from the last 12 months
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 12)

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, amount, type, date, account_id, description, metadata, source')
      .eq('user_id', user.id)
      .in('type', ['income', 'expense'])
      .gte('date', cutoff.toISOString().split('T')[0])
      .order('date', { ascending: true })

    if (error) throw error
    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ data: { detected: 0, message: 'Nenhuma transação para analisar.' } })
    }

    // Group transactions by amount for efficient matching
    const byAmount = new Map<number, typeof transactions>()
    for (const tx of transactions) {
      const amt = parseFloat(String(tx.amount))
      if (!byAmount.has(amt)) byAmount.set(amt, [])
      byAmount.get(amt)!.push(tx)
    }

    const matchedIds = new Set<string>()
    const pairs: Array<{ incomeId: string; expenseId: string; amount: number; reason: string }> = []

    for (const [amount, group] of Array.from(byAmount.entries())) {
      if (amount === 0) continue

      const incomes = group.filter((t: { type: string }) => t.type === 'income')
      const expenses = group.filter((t: { type: string }) => t.type === 'expense')

      // For each income, find the best matching expense
      for (const inc of incomes) {
        if (matchedIds.has(inc.id)) continue

        for (const exp of expenses) {
          if (matchedIds.has(exp.id)) continue
          if (inc.account_id === exp.account_id) continue // Same account = not a transfer

          // Check date proximity (within 2 days)
          const incDate = new Date(inc.date)
          const expDate = new Date(exp.date)
          const daysDiff = Math.abs(incDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24)

          if (daysDiff > 2) continue

          // Determine match reason
          let reason = ''

          // Strategy 1: CPF match (strongest signal)
          const incMeta = typeof inc.metadata === 'string' ? JSON.parse(inc.metadata) : (inc.metadata ?? {})
          const expMeta = typeof exp.metadata === 'string' ? JSON.parse(exp.metadata) : (exp.metadata ?? {})

          const incPayerCpf = normalizeCpf(incMeta.payer_cpf || '')
          const incReceiverCpf = normalizeCpf(incMeta.receiver_cpf || '')
          const expPayerCpf = normalizeCpf(expMeta.payer_cpf || '')
          const expReceiverCpf = normalizeCpf(expMeta.receiver_cpf || '')

          // The income's payer should be the same person as the expense's receiver (yourself)
          // OR both payer and receiver are the same CPF
          if (incPayerCpf && expPayerCpf && incPayerCpf === expPayerCpf) {
            reason = `CPF idêntico: ${incPayerCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}`
          } else if (incReceiverCpf && expReceiverCpf && incReceiverCpf === expReceiverCpf) {
            reason = `CPF do destinatário idêntico`
          } else if (incPayerCpf && incReceiverCpf && incPayerCpf === incReceiverCpf) {
            reason = `Auto-transferência detectada (mesmo CPF payer/receiver)`
          }

          // Strategy 2: Both from Pluggy + different accounts + same value + within 2 days
          if (!reason && inc.source === 'pluggy' && exp.source === 'pluggy') {
            reason = `Transação gêmea: mesmo valor (R$${amount.toFixed(2)}), contas diferentes, ${daysDiff === 0 ? 'mesmo dia' : `${daysDiff.toFixed(0)} dia(s) de diferença`}`
          }

          if (reason) {
            matchedIds.add(inc.id)
            matchedIds.add(exp.id)
            pairs.push({ incomeId: inc.id, expenseId: exp.id, amount, reason })
            break // Move to next income
          }
        }
      }
    }

    if (pairs.length === 0) {
      return NextResponse.json({
        data: { detected: 0, pairs: [], message: 'Nenhuma transferência entre contas detectada.' }
      })
    }

    // Reclassify matched transactions as 'transfer'
    const allIds = Array.from(matchedIds)
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ type: 'transfer' })
      .eq('user_id', user.id)
      .in('id', allIds)

    if (updateError) throw updateError

    return NextResponse.json({
      data: {
        detected: pairs.length,
        reclassified: allIds.length,
        pairs: pairs.map(p => ({
          amount: p.amount,
          reason: p.reason,
        })),
        message: `${pairs.length} par(es) de transferências detectado(s) e ${allIds.length} transações reclassificadas.`
      }
    })
  } catch (err) {
    console.error('Transfer detection error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function normalizeCpf(doc: string): string {
  if (!doc) return ''
  return doc.replace(/\D/g, '')
}
