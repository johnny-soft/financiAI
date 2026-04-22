import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const range = req.nextUrl.searchParams.get('range') ?? '6m'
    const isDays = range.endsWith('d')
    const value = parseInt(range.replace(/[^\d]/g, '')) || 6

    const startDate = new Date()
    if (isDays) {
      startDate.setDate(startDate.getDate() - value + 1)
    } else {
      startDate.setMonth(startDate.getMonth() - value + 1)
      startDate.setDate(1)
    }

    const start = startDate.toISOString().split('T')[0]
    const end = new Date().toISOString().split('T')[0]
    const trendMonths = isDays ? 1 : value

    // Fetch goal-linked category IDs to exclude from totals
    const { data: goalCategories } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', user.id)
      .not('goal_id', 'is', null)

    const goalCategoryIds = new Set((goalCategories ?? []).map(c => c.id))

    // Parallel data fetching
    const [trendRes, categoryRes, totalsRes] = await Promise.all([
      supabase.rpc('get_monthly_balance', { p_user_id: user.id, p_months: trendMonths }),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
      supabase
        .from('transactions')
        .select('amount, type, category_id, is_extraordinary')
        .eq('user_id', user.id)
        .neq('type', 'transfer')
        .gte('date', start)
        .lte('date', end)
    ])

    // Parse RPC results to ensure numeric types (Supabase can return strings for DECIMAL)
    const monthlyBalance = (trendRes.data ?? []).map((row: { month: string; income: number; expense: number; balance: number }) => ({
      month: row.month,
      income: parseFloat(String(row.income)) || 0,
      expense: parseFloat(String(row.expense)) || 0,
      balance: parseFloat(String(row.balance)) || 0,
    }))
    const categorySpending = (categoryRes.data ?? []).filter((c: { total: number }) => parseFloat(String(c.total)) > 0)
    const txs = totalsRes.data ?? []

    // Filter: exclude goal-linked and extraordinary
    const regularTxs = txs.filter((t: { category_id: string | null; is_extraordinary: boolean | null }) =>
      !t.is_extraordinary && !goalCategoryIds.has(t.category_id as string)
    )

    const totalIncome = regularTxs
      .filter((t: { type: string }) => t.type === 'income')
      .reduce((a: number, t: { amount: number }) => a + parseFloat(String(t.amount)), 0)

    const totalExpense = regularTxs
      .filter((t: { type: string }) => t.type === 'expense')
      .reduce((a: number, t: { amount: number }) => a + parseFloat(String(t.amount)), 0)

    // Use number of months in range for average (not trend data which may have gaps)
    const monthsInRange = isDays ? 1 : value
    const avgMonthlyExpense = monthsInRange > 0 ? totalExpense / monthsInRange : 0
    const topExpenseCategory = categorySpending.length > 0 ? categorySpending[0] : null

    return NextResponse.json({
      data: {
        monthlyBalance,
        categorySpending,
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpense: Math.round(totalExpense * 100) / 100,
        avgMonthlyExpense: Math.round(avgMonthlyExpense * 100) / 100,
        topExpenseCategory,
      }
    })
  } catch (err) {
    console.error('Reports API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
