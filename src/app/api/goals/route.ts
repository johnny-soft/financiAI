import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { title, description, icon, target_amount, current_amount, target_date, category } = body

    const { data: goal, error } = await supabase.from('goals').insert({
      user_id: user.id,
      title,
      description: description || null,
      icon: icon || '🎯',
      target_amount: Number(target_amount),
      current_amount: Number(current_amount ?? 0),
      target_date: target_date || null,
      category: category || 'other',
    }).select().single()

    if (error) throw error

    // Criar a categoria associada à meta
    await supabase.from('categories').insert({
      user_id: user.id,
      name: `🎯 Meta: ${title}`,
      icon: icon || '🎯',
      color: '#10b981', // Verde sucesso para metas
      type: 'expense',
      goal_id: goal.id
    })

    return NextResponse.json({ data: goal }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
