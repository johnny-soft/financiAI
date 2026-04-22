import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const months = Number(req.nextUrl.searchParams.get('months') ?? 6)

    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months + 1)
    startDate.setDate(1)
    const start = startDate.toISOString().split('T')[0]
    const end = new Date().toISOString().split('T')[0]

    const [trendRes, categoryRes] = await Promise.all([
      supabase.rpc('get_monthly_balance', { p_user_id: user.id, p_months: months }),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
    ])

    const monthlyBalance = trendRes.data ?? []
    const categorySpending = (categoryRes.data ?? []).filter((c: { total: number }) => c.total > 0)

    const totalIncome = monthlyBalance.reduce((a: number, m: { income: number }) => a + m.income, 0)
    const totalExpense = monthlyBalance.reduce((a: number, m: { expense: number }) => a + m.expense, 0)
    const avgMonthlyExpense = monthlyBalance.length > 0 ? totalExpense / monthlyBalance.length : 0
    const topExpenseCategory = categorySpending.length > 0 ? categorySpending[0] : null

    return NextResponse.json({
      data: {
        monthlyBalance,
        categorySpending,
        totalIncome,
        totalExpense,
        avgMonthlyExpense,
        topExpenseCategory,
      }
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
