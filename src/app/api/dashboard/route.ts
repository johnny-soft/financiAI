import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

/**
 * Calculate the CURRENT billing cycle dates.
 * This is the bill the user sees in their bank app as "fatura atual".
 *
 * Example: closing_day=26
 *   today=Apr 16 (before closing) → current bill: Mar 27 → Apr 26
 *   today=Apr 28 (after closing)  → current bill: Apr 27 → May 26
 */
function getBillingPeriod(closingDay: number): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  let billEnd: Date
  let billStart: Date

  if (now.getDate() > closingDay) {
    // Bill already closed this month → new cycle started
    billStart = new Date(year, month, closingDay + 1)
    billEnd = new Date(year, month + 1, closingDay)
  } else {
    // Bill hasn't closed yet → still in current cycle
    billStart = new Date(year, month - 1, closingDay + 1)
    billEnd = new Date(year, month, closingDay)
  }

  return {
    start: billStart.toISOString().split('T')[0],
    end: billEnd.toISOString().split('T')[0],
  }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { start, end } = getCurrentMonthRange()

    // Run all queries in parallel
    const [
      accountsRes,
      monthTxRes,
      recentTxRes,
      categoryRes,
      trendRes,
      insightsRes,
    ] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true),
      // Monthly income/expenses (excludes transfers)
      supabase.from('transactions')
        .select('amount, type, account_id')
        .eq('user_id', user.id)
        .neq('type', 'transfer')
        .gte('date', start)
        .lte('date', end),
      supabase.from('transactions')
        .select('*, category:categories(id,name,icon,color), account:accounts(id,name,type)')
        .eq('user_id', user.id)
        .neq('type', 'transfer')
        .order('date', { ascending: false })
        .limit(10),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
      supabase.rpc('get_monthly_balance', { p_user_id: user.id, p_months: 6 }),
      supabase.from('ai_insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .eq('is_dismissed', false),
    ])

    const accounts = accountsRes.data ?? []
    const monthTx = monthTxRes.data ?? []

    // Credit card accounts
    const creditCardAccounts = accounts.filter(a => a.type === 'credit')
    const creditCardAccountIds = new Set(creditCardAccounts.map(a => a.id))

    // Total Balance = only non-credit-card accounts
    const totalBalance = accounts
      .filter(a => a.type !== 'credit')
      .reduce((a, acc) => a + parseFloat(String(acc.balance ?? 0)), 0)

    // Credit Card bill = calculated using billing cycle dates (if configured)
    let totalCreditDebt = 0
    const debugInfo: Record<string, unknown> = {}

    if (creditCardAccounts.length > 0) {
      debugInfo.creditCardAccounts = creditCardAccounts.map(a => ({
        id: a.id, name: a.name, type: a.type,
        closing_day: a.closing_day, due_day: a.due_day,
      }))

      // Get the closing day from the first credit card (or use default)
      const closingDay = creditCardAccounts[0].closing_day

      let billingStart: string
      let billingEnd: string

      if (closingDay) {
        const billing = getBillingPeriod(closingDay)
        billingStart = billing.start
        billingEnd = billing.end
      } else {
        // No closing day configured → use current month as fallback
        billingStart = start
        billingEnd = end
      }

      debugInfo.billingPeriod = { start: billingStart, end: billingEnd, closingDay }

      const { data: billTx } = await supabase
        .from('transactions')
        .select('amount, description, date, type')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .in('account_id', creditCardAccounts.map(a => a.id))
        .gte('date', billingStart)
        .lte('date', billingEnd)

      debugInfo.billTransactionCount = (billTx ?? []).length
      debugInfo.billTransactions = (billTx ?? []).slice(0, 5).map(t => ({
        desc: t.description, amount: t.amount, date: t.date, type: t.type,
      }))

      totalCreditDebt = (billTx ?? [])
        .reduce((a, t) => a + parseFloat(String(t.amount)), 0)
    } else {
      debugInfo.note = 'No credit card accounts found (type !== credit)'
      debugInfo.allAccountTypes = accounts.map(a => ({ name: a.name, type: a.type }))
    }

    // Income = only from non-credit-card accounts (real income)
    const monthIncome = monthTx
      .filter((t) => t.type === 'income' && !creditCardAccountIds.has(t.account_id))
      .reduce((a, t) => a + parseFloat(String(t.amount)), 0)

    // Expenses = all expense transactions this month
    const monthExpense = monthTx
      .filter((t) => t.type === 'expense')
      .reduce((a, t) => a + parseFloat(String(t.amount)), 0)

    const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 100) : 0

    return NextResponse.json({
      data: {
        totalBalance,
        totalCreditDebt,
        monthIncome,
        monthExpense,
        monthBalance: monthIncome - monthExpense,
        savingsRate: Math.max(0, savingsRate),
        accounts,
        recentTransactions: recentTxRes.data ?? [],
        topCategories: (categoryRes.data ?? []).slice(0, 6),
        monthlyTrend: trendRes.data ?? [],
        unreadInsights: insightsRes.count ?? 0,
        _debug: debugInfo,
      }
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
