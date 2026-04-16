import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

/**
 * Calculate billing cycle dates based on closing day.
 * Example: closing_day=15, today=April 16 → bill period: Mar 16 → Apr 15
 * Example: closing_day=15, today=April 10 → bill period: Mar 16 → Apr 15
 */
function getBillingPeriod(closingDay: number): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  let billEnd: Date
  let billStart: Date

  if (now.getDate() > closingDay) {
    // Bill already closed this month → current bill is: closing+1 this month → closing next month
    billStart = new Date(year, month, closingDay + 1)
    billEnd = new Date(year, month + 1, closingDay)
  } else {
    // Bill hasn't closed yet → current bill is: closing+1 last month → closing this month
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

    if (creditCardAccounts.length > 0) {
      // Get the closing day from the first credit card (or use default)
      const closingDay = creditCardAccounts[0].closing_day

      if (closingDay) {
        // Use billing cycle: from last closing+1 to this closing
        const billing = getBillingPeriod(closingDay)

        const { data: billTx } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .in('account_id', creditCardAccounts.map(a => a.id))
          .gte('date', billing.start)
          .lte('date', billing.end)

        totalCreditDebt = (billTx ?? [])
          .reduce((a, t) => a + parseFloat(String(t.amount)), 0)
      } else {
        // No closing day configured → use current month as fallback
        const { data: billTx } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('type', 'expense')
          .in('account_id', creditCardAccounts.map(a => a.id))
          .gte('date', start)
          .lte('date', end)

        totalCreditDebt = (billTx ?? [])
          .reduce((a, t) => a + parseFloat(String(t.amount)), 0)
      }
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
      }
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
