import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const q = searchParams.get('q')
    const type = searchParams.get('type')
    const category = searchParams.get('category')
    const page = Number(searchParams.get('page') ?? 1)
    const limit = Number(searchParams.get('limit') ?? 20)
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('transactions')
      .select('*, category:categories(id,name,icon,color), account:accounts(id,name,institution)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (q) query = query.ilike('description', `%${q}%`)
    if (type && type !== 'all') query = query.eq('type', type)
    if (category) query = query.eq('category_id', category)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ data, count })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { description, amount, type, date, category_id, account_id, payment_method, notes, is_recurring } = body

    if (!description || !amount || !type || !date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase.from('transactions').insert({
      user_id: user.id,
      description,
      amount: Number(amount),
      type,
      date,
      category_id: category_id || null,
      account_id: account_id || null,
      payment_method: payment_method || 'other',
      notes: notes || null,
      is_recurring: is_recurring ?? false,
      source: 'manual',
    }).select().single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
