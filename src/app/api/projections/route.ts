import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Cash Flow Projection API
 * Detects installments (X/Y) and recurring expenses to project 12 months ahead.
 */
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const today = new Date()

    // Fetch all expenses from last 6 months to detect patterns
    const sixMonthsAgo = new Date(today)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: transactions } = await supabase
      .from('transactions')
      .select('description, amount, type, date, is_recurring')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('date', sixMonthsAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })

    const { data: profileData } = await supabase
      .from('profiles')
      .select('monthly_income')
      .eq('id', user.id)
      .single()

    const monthlyIncome = parseFloat(String(profileData?.monthly_income ?? 0))
    const txs = transactions ?? []

    // ========================================
    // 1. DETECT INSTALLMENTS (parcelas)
    // ========================================
    const installmentRegex = /(\d{1,2})\/(\d{1,2})/
    const installments: Array<{
      description: string
      amount: number
      currentInstallment: number
      totalInstallments: number
      remainingInstallments: number
      monthlyCommitment: number
      endsAt: string // YYYY-MM
    }> = []

    const seenInstallments = new Set<string>()

    for (const tx of txs) {
      const match = tx.description.match(installmentRegex)
      if (!match) continue

      const current = parseInt(match[1])
      const total = parseInt(match[2])
      if (current > total || total <= 1) continue

      // De-duplicate by base description
      const baseDesc = tx.description.replace(installmentRegex, '').trim()
      const key = `${baseDesc}-${total}-${tx.amount}`
      if (seenInstallments.has(key)) continue
      seenInstallments.add(key)

      const remaining = total - current
      const txDate = new Date(tx.date)
      const endDate = new Date(txDate)
      endDate.setMonth(endDate.getMonth() + remaining)

      installments.push({
        description: baseDesc || tx.description,
        amount: parseFloat(String(tx.amount)),
        currentInstallment: current,
        totalInstallments: total,
        remainingInstallments: remaining,
        monthlyCommitment: parseFloat(String(tx.amount)),
        endsAt: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`,
      })
    }

    // ========================================
    // 2. DETECT RECURRING EXPENSES (fixed costs)
    // ========================================
    // Group by normalized description & look for monthly patterns
    const descMap = new Map<string, { amounts: number[]; dates: string[] }>()
    for (const tx of txs) {
      if (tx.description.match(installmentRegex)) continue // skip installments
      const key = tx.description.toLowerCase().replace(/\d{3,}/g, '').replace(/\s+/g, ' ').trim()
      if (!descMap.has(key)) descMap.set(key, { amounts: [], dates: [] })
      descMap.get(key)!.amounts.push(parseFloat(String(tx.amount)))
      descMap.get(key)!.dates.push(tx.date)
    }

    const recurringExpenses: Array<{ description: string; avgAmount: number; frequency: number }> = []
    for (const [desc, data] of descMap.entries()) {
      if (data.amounts.length >= 3) { // appears at least 3 times in 6 months
        const avg = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length
        recurringExpenses.push({
          description: desc,
          avgAmount: Math.round(avg * 100) / 100,
          frequency: data.amounts.length,
        })
      }
    }

    // ========================================
    // 3. PROJECT 12 MONTHS AHEAD
    // ========================================
    const projection: Array<{
      month: string
      installmentTotal: number
      recurringTotal: number
      committedTotal: number
      commitmentPct: number // % of income
    }> = []

    const totalRecurringMonthly = recurringExpenses.reduce((a, r) => a + r.avgAmount, 0)

    for (let i = 0; i < 12; i++) {
      const projDate = new Date(today)
      projDate.setMonth(projDate.getMonth() + i)
      const monthKey = `${projDate.getFullYear()}-${String(projDate.getMonth() + 1).padStart(2, '0')}`

      // Sum installments still active in this month
      const installmentTotal = installments
        .filter(inst => inst.endsAt >= monthKey)
        .reduce((a, inst) => a + inst.monthlyCommitment, 0)

      const committedTotal = installmentTotal + totalRecurringMonthly
      const commitmentPct = monthlyIncome > 0 ? Math.round((committedTotal / monthlyIncome) * 100) : 0

      projection.push({
        month: monthKey,
        installmentTotal: Math.round(installmentTotal * 100) / 100,
        recurringTotal: Math.round(totalRecurringMonthly * 100) / 100,
        committedTotal: Math.round(committedTotal * 100) / 100,
        commitmentPct,
      })
    }

    // ========================================
    // 4. GENERATE ALERTS
    // ========================================
    const alerts: string[] = []
    for (const p of projection) {
      if (p.commitmentPct > 70) {
        const [y, m] = p.month.split('-')
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        alerts.push(`⚠️ ${monthNames[parseInt(m) - 1]}/${y}: ${p.commitmentPct}% da renda já comprometida com parcelas e fixos.`)
      }
    }

    return NextResponse.json({
      data: {
        monthlyIncome,
        installments: installments.sort((a, b) => b.remainingInstallments - a.remainingInstallments),
        recurringExpenses: recurringExpenses.sort((a, b) => b.avgAmount - a.avgAmount).slice(0, 15),
        projection,
        alerts,
        summary: {
          totalInstallmentCommitment: installments.reduce((a, i) => a + i.monthlyCommitment, 0),
          totalRecurringCommitment: totalRecurringMonthly,
          peakCommitmentMonth: projection.reduce((max, p) => p.commitmentPct > max.commitmentPct ? p : max, projection[0]),
        }
      }
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
