import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getPluggyAccounts,
  getPluggyTransactions,
  mapPluggyAccountType,
  mapPluggyTransaction,
} from '@/lib/pluggy'

export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get user's connected Pluggy item IDs
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('pluggy_item_ids')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    const itemIds: string[] = profile?.pluggy_item_ids ?? []

    if (itemIds.length === 0) {
      return NextResponse.json({
        data: { accountsSynced: 0, transactionsSynced: 0, errors: ['Nenhuma conexão bancária encontrada. Conecte um banco primeiro.'] }
      })
    }

    let totalAccountsSynced = 0
    let totalTransactionsSynced = 0
    const errors: string[] = []

    for (const itemId of itemIds) {
      try {
        // 1. Fetch accounts from Pluggy
        const pluggyAccounts = await getPluggyAccounts(itemId)

        for (const pAccount of pluggyAccounts) {
          try {
            // 2. Upsert account into our DB
            const accountData = {
              user_id: user.id,
              pluggy_account_id: pAccount.id,
              pluggy_item_id: itemId,
              name: pAccount.name,
              institution: pAccount.institution?.name || null,
              institution_logo: pAccount.institution?.imageUrl || null,
              type: mapPluggyAccountType(pAccount.type, pAccount.subtype),
              balance: pAccount.balance,
              currency: pAccount.currencyCode || 'BRL',
              is_active: true,
              last_synced_at: new Date().toISOString(),
            }

            // Try to find existing account by pluggy_account_id
            const { data: existingAccount } = await supabase
              .from('accounts')
              .select('id')
              .eq('pluggy_account_id', pAccount.id)
              .eq('user_id', user.id)
              .single()

            let accountId: string

            if (existingAccount) {
              // Update existing
              const { error: updateErr } = await supabase
                .from('accounts')
                .update(accountData)
                .eq('id', existingAccount.id)

              if (updateErr) throw updateErr
              accountId = existingAccount.id
            } else {
              // Insert new
              const { data: newAccount, error: insertErr } = await supabase
                .from('accounts')
                .insert(accountData)
                .select('id')
                .single()

              if (insertErr) throw insertErr
              accountId = newAccount.id
            }

            totalAccountsSynced++

            // 3. Fetch transactions from Pluggy for this account
            const threeMonthsAgo = new Date()
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
            const from = threeMonthsAgo.toISOString().split('T')[0]

            const pluggyTransactions = await getPluggyTransactions(pAccount.id, from)

            // 4. Upsert transactions
            for (const pTx of pluggyTransactions) {
              const txData = {
                user_id: user.id,
                account_id: accountId,
                ...mapPluggyTransaction(pTx),
              }

              // Use pluggy_transaction_id to avoid duplicates
              const { data: existingTx } = await supabase
                .from('transactions')
                .select('id')
                .eq('pluggy_transaction_id', pTx.id)
                .eq('user_id', user.id)
                .single()

              if (existingTx) {
                // Update existing transaction
                await supabase
                  .from('transactions')
                  .update(txData)
                  .eq('id', existingTx.id)
              } else {
                // Insert new transaction
                await supabase
                  .from('transactions')
                  .insert(txData)
              }

              totalTransactionsSynced++
            }
          } catch (accErr) {
            const msg = accErr instanceof Error ? accErr.message : 'Account sync error'
            errors.push(`Conta ${pAccount.name}: ${msg}`)
          }
        }
      } catch (itemErr) {
        const msg = itemErr instanceof Error ? itemErr.message : 'Item sync error'
        errors.push(`Item ${itemId}: ${msg}`)
      }
    }

    // 5. Log sync result
    for (const itemId of itemIds) {
      await supabase.from('pluggy_sync_log').insert({
        user_id: user.id,
        item_id: itemId,
        status: errors.length > 0 ? 'partial' : 'success',
        transactions_synced: totalTransactionsSynced,
        error_message: errors.length > 0 ? errors.join('; ') : null,
      })
    }

    return NextResponse.json({
      data: {
        accountsSynced: totalAccountsSynced,
        transactionsSynced: totalTransactionsSynced,
        errors,
      }
    })
  } catch (err) {
    console.error('Pluggy sync error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
