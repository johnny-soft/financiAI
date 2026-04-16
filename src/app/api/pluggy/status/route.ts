import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPluggyToken, getPluggyItem, getPluggyAccounts } from '@/lib/pluggy'

// GET /api/pluggy/status — diagnostic endpoint
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {}

  // 1. Check env vars
  const hasClientId = !!process.env.PLUGGY_CLIENT_ID
  const hasClientSecret = !!process.env.PLUGGY_CLIENT_SECRET
  checks['env_vars'] = {
    ok: hasClientId && hasClientSecret,
    detail: hasClientId && hasClientSecret
      ? 'PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET are set'
      : `Missing: ${!hasClientId ? 'PLUGGY_CLIENT_ID ' : ''}${!hasClientSecret ? 'PLUGGY_CLIENT_SECRET' : ''}`,
  }

  // 2. Check Supabase auth
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    checks['supabase_auth'] = {
      ok: !!user,
      detail: user ? `Authenticated as ${user.id}` : `Not authenticated: ${error?.message || 'No session'}`,
    }

    // 3. Check profile & pluggy_item_ids
    if (user) {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('pluggy_item_ids')
        .eq('id', user.id)
        .single()

      checks['profile'] = {
        ok: !!profile,
        detail: profileErr
          ? `Profile error: ${profileErr.message}`
          : `pluggy_item_ids: ${JSON.stringify(profile?.pluggy_item_ids ?? [])}`,
      }

      // 4. Check Pluggy API auth
      if (hasClientId && hasClientSecret) {
        try {
          const token = await getPluggyToken()
          checks['pluggy_auth'] = {
            ok: true,
            detail: `API Key obtained (${token.substring(0, 10)}...)`,
          }

          // 5. Check if items are accessible
          const itemIds: string[] = profile?.pluggy_item_ids ?? []
          if (itemIds.length > 0) {
            try {
              const item = await getPluggyItem(itemIds[0])
              checks['pluggy_item'] = {
                ok: true,
                detail: `Item ${itemIds[0]}: connector=${item.connector?.name}, status=${JSON.stringify(item.status)}`,
              }

              // 6. Check if accounts are accessible
              try {
                const accounts = await getPluggyAccounts(itemIds[0])
                checks['pluggy_accounts'] = {
                  ok: accounts.length > 0,
                  detail: `Found ${accounts.length} accounts: ${accounts.map(a => `${a.name} (${a.type}/${a.subtype}, balance=${a.balance})`).join(', ')}`,
                }
              } catch (accErr) {
                checks['pluggy_accounts'] = {
                  ok: false,
                  detail: `Failed to fetch accounts: ${accErr instanceof Error ? accErr.message : String(accErr)}`,
                }
              }
            } catch (itemErr) {
              checks['pluggy_item'] = {
                ok: false,
                detail: `Failed to fetch item ${itemIds[0]}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`,
              }
            }
          } else {
            checks['pluggy_item'] = {
              ok: false,
              detail: 'No pluggy_item_ids in profile. You need to connect a bank first via the Pluggy Connect Widget on /accounts.',
            }
          }
        } catch (authErr) {
          checks['pluggy_auth'] = {
            ok: false,
            detail: `Pluggy auth failed: ${authErr instanceof Error ? authErr.message : String(authErr)}`,
          }
        }
      }
    }
  } catch (err) {
    checks['supabase_auth'] = {
      ok: false,
      detail: `Supabase error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json({ status: allOk ? 'healthy' : 'issues_found', checks })
}
