import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMonthRange } from '@/lib/utils'

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
      creditCardTxRes,
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
      // Credit card expenses this month (for "Fatura Cartão" stat)
      supabase.from('transactions')
        .select('amount, account_id')
        .eq('user_id', user.id)
        .eq('type', 'expense')
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
    const creditCardTx = creditCardTxRes.data ?? []

    // Credit card account IDs
    const creditCardAccountIds = new Set(
      accounts.filter(a => a.type === 'credit').map(a => a.id)
    )

    // Total Balance = only non-credit-card accounts
    const totalBalance = accounts
      .filter(a => a.type !== 'credit')
      .reduce((a, acc) => a + parseFloat(String(acc.balance ?? 0)), 0)

    // Credit Card bill THIS MONTH = sum of credit card expense transactions this month
    // (not the total balance, which includes previous months' debt)
    const monthCreditCardExpenses = creditCardTx
      .filter(t => creditCardAccountIds.has(t.account_id))
      .reduce((a, t) => a + parseFloat(String(t.amount)), 0)

    // Income = only from non-credit-card accounts (real income)
    const monthIncome = monthTx
      .filter((t) => t.type === 'income' && !creditCardAccountIds.has(t.account_id))
      .reduce((a, t) => a + parseFloat(String(t.amount)), 0)

    // Expenses = all expense transactions this month (includes credit card purchases)
    const monthExpense = monthTx
      .filter((t) => t.type === 'expense')
      .reduce((a, t) => a + parseFloat(String(t.amount)), 0)

    const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 100) : 0

    return NextResponse.json({
      data: {
        totalBalance,
        totalCreditDebt: monthCreditCardExpenses,
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
