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

    let startDate = new Date()
    if (isDays) {
      startDate.setDate(startDate.getDate() - value + 1)
    } else {
      startDate.setMonth(startDate.getMonth() - value + 1)
      startDate.setDate(1)
    }
    
    const start = startDate.toISOString().split('T')[0]
    const end = new Date().toISOString().split('T')[0]

    const trendMonthsToRequest = isDays ? 1 : value

    const [trendRes, categoryRes, totalsRes] = await Promise.all([
      supabase.rpc('get_monthly_balance', { p_user_id: user.id, p_months: trendMonthsToRequest }),
      supabase.rpc('get_spending_by_category', { p_user_id: user.id, p_start: start, p_end: end }),
      supabase.from('transactions').select('amount, type').eq('user_id', user.id).neq('type', 'transfer').gte('date', start).lte('date', end)
    ])

    const monthlyBalance = trendRes.data ?? []
    const categorySpending = (categoryRes.data ?? []).filter((c: { total: number }) => c.total > 0)
    const txs = totalsRes.data ?? []

    const totalIncome = txs.filter((t: { type: string }) => t.type === 'income').reduce((a: number, t: { amount: number }) => a + t.amount, 0)
    const totalExpense = txs.filter((t: { type: string }) => t.type === 'expense').reduce((a: number, t: { amount: number }) => a + t.amount, 0)
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
