import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createConnectToken } from '@/lib/pluggy'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const accessToken = await createConnectToken()
    return NextResponse.json({ data: { accessToken } })
  } catch (err) {
    console.error('Connect token error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
