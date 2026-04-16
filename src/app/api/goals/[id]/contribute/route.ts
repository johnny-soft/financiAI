import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { amount, note } = await req.json()
    if (!amount || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    // Get current goal
    const { data: goal, error: goalError } = await supabase
      .from('goals').select('*').eq('id', params.id).eq('user_id', user.id).single()

    if (goalError || !goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })

    const newAmount = goal.current_amount + Number(amount)
    const isComplete = newAmount >= goal.target_amount

    // Insert contribution + update goal
    const [contribRes, updateRes] = await Promise.all([
      supabase.from('goal_contributions').insert({
        goal_id: params.id,
        user_id: user.id,
        amount: Number(amount),
        note: note || null,
        date: new Date().toISOString().split('T')[0],
      }),
      supabase.from('goals').update({
        current_amount: newAmount,
        status: isComplete ? 'completed' : 'active',
      }).eq('id', params.id).eq('user_id', user.id),
    ])

    if (contribRes.error) throw contribRes.error
    if (updateRes.error) throw updateRes.error

    return NextResponse.json({ success: true, completed: isComplete })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
