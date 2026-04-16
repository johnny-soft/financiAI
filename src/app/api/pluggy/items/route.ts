import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { itemId } = await req.json()
    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    // Get current profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('pluggy_item_ids')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    const currentIds: string[] = profile?.pluggy_item_ids ?? []

    // Avoid duplicates
    if (currentIds.includes(itemId)) {
      return NextResponse.json({ data: { message: 'Item already connected' } })
    }

    // Append the new item ID to the profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ pluggy_item_ids: [...currentIds, itemId] })
      .eq('id', user.id)

    if (updateError) throw updateError

    return NextResponse.json({ data: { message: 'Item connected successfully', itemId } }, { status: 201 })
  } catch (err) {
    console.error('Pluggy items error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('pluggy_item_ids')
      .eq('id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({ data: { itemIds: profile?.pluggy_item_ids ?? [] } })
  } catch (err) {
    console.error('Pluggy items error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
