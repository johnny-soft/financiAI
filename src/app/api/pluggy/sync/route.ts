import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getPluggyAccounts,
  getPluggyTransactions,
  getPluggyItem,
  mapPluggyAccountType,
  mapPluggyTransaction,
  PLUGGY_CATEGORY_MAP,
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

    if (profileError) {
      console.error('Profile fetch error:', profileError)
      return NextResponse.json({ error: `Erro ao buscar perfil: ${profileError.message}` }, { status: 500 })
    }

    const itemIds: string[] = profile?.pluggy_item_ids ?? []

    if (itemIds.length === 0) {
      return NextResponse.json({
        data: { accountsSynced: 0, transactionsSynced: 0, errors: ['Nenhuma conexão bancária encontrada. Conecte um banco primeiro.'] }
      })
    }

    let totalAccountsSynced = 0
    let totalTransactionsSynced = 0
    const errors: string[] = []

    // Load user's categories for auto-categorization
    const { data: userCategories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', user.id)

    // Build name → id lookup
    const categoryLookup: Record<string, string> = {}
    for (const cat of (userCategories ?? [])) {
      categoryLookup[cat.name.toLowerCase()] = cat.id
    }

    for (const itemId of itemIds) {
      try {
        // Fetch item info to get institution/connector name
        let connectorName: string | null = null
        let connectorLogo: string | null = null
        try {
          const item = await getPluggyItem(itemId)
          connectorName = item.connector?.name ?? null
          connectorLogo = item.connector?.imageUrl ?? null
        } catch (itemInfoErr) {
          console.error(`Failed to fetch item info for ${itemId}:`, itemInfoErr)
        }

        // 1. Fetch accounts from Pluggy
        const pluggyAccounts = await getPluggyAccounts(itemId)
        console.log(`Item ${itemId}: found ${pluggyAccounts.length} accounts`)

        for (const pAccount of pluggyAccounts) {
          try {
            // 2. Upsert account into our DB
            const accountData = {
              user_id: user.id,
              pluggy_account_id: pAccount.id,
              pluggy_item_id: itemId,
              name: pAccount.name,
              institution: pAccount.institution?.name || connectorName || null,
              institution_logo: pAccount.institution?.imageUrl || connectorLogo || null,
              type: mapPluggyAccountType(pAccount.type, pAccount.subtype || ''),
              balance: pAccount.balance,
              currency: pAccount.currencyCode || 'BRL',
              is_active: true,
              last_synced_at: new Date().toISOString(),
            }

            console.log(`Upserting account: ${pAccount.name} (${pAccount.id})`)

            // Try to find existing account by pluggy_account_id
            const { data: existingAccount } = await supabase
              .from('accounts')
              .select('id')
              .eq('pluggy_account_id', pAccount.id)
              .eq('user_id', user.id)
              .maybeSingle()

            let accountId: string

            if (existingAccount) {
              const { error: updateErr } = await supabase
                .from('accounts')
                .update(accountData)
                .eq('id', existingAccount.id)

              if (updateErr) {
                console.error('Account update error:', updateErr)
                throw updateErr
              }
              accountId = existingAccount.id
            } else {
              const { data: newAccount, error: insertErr } = await supabase
                .from('accounts')
                .insert(accountData)
                .select('id')
                .single()

              if (insertErr) {
                console.error('Account insert error:', insertErr)
                throw insertErr
              }
              accountId = newAccount.id
            }

            totalAccountsSynced++

            // 3. Fetch transactions from Pluggy for this account
            const threeMonthsAgo = new Date()
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
            const from = threeMonthsAgo.toISOString().split('T')[0]

            const pluggyTransactions = await getPluggyTransactions(pAccount.id, from)
            console.log(`Account ${pAccount.name}: found ${pluggyTransactions.length} transactions`)

            // 4. Upsert transactions
            const ourAccountType = mapPluggyAccountType(pAccount.type, pAccount.subtype || '')

            for (const pTx of pluggyTransactions) {
              try {
                const mapped = mapPluggyTransaction(pTx, ourAccountType)

                // Auto-categorize using Pluggy category
                let category_id: string | null = null
                if (mapped.pluggy_category) {
                  const ourCategoryName = PLUGGY_CATEGORY_MAP[mapped.pluggy_category]
                  if (ourCategoryName) {
                    category_id = categoryLookup[ourCategoryName.toLowerCase()] || null
                  }
                }

                const txData: Record<string, unknown> = {
                  user_id: user.id,
                  account_id: accountId,
                  pluggy_transaction_id: mapped.pluggy_transaction_id,
                  description: mapped.description,
                  amount: mapped.amount,
                  type: mapped.type,
                  date: mapped.date,
                  payment_method: mapped.payment_method,
                  source: mapped.source,
                  metadata: JSON.stringify(mapped.metadata),
                }
                if (category_id) txData.category_id = category_id

                // Use pluggy_transaction_id to avoid duplicates
                const { data: existingTx } = await supabase
                  .from('transactions')
                  .select('id')
                  .eq('pluggy_transaction_id', pTx.id)
                  .eq('user_id', user.id)
                  .maybeSingle()

                if (existingTx) {
                  await supabase
                    .from('transactions')
                    .update(txData)
                    .eq('id', existingTx.id)
                } else {
                  const { error: txInsertErr } = await supabase
                    .from('transactions')
                    .insert(txData)

                  if (txInsertErr) {
                    console.error('Transaction insert error:', txInsertErr, txData)
                    throw txInsertErr
                  }
                }

                totalTransactionsSynced++
              } catch (txErr) {
                const msg = txErr instanceof Error ? txErr.message : 'Transaction sync error'
                console.error(`Transaction ${pTx.id} error:`, txErr)
                errors.push(`Transação "${pTx.description}": ${msg}`)
              }
            }
          } catch (accErr) {
            const msg = accErr instanceof Error ? accErr.message : 'Account sync error'
            console.error(`Account ${pAccount.name} error:`, accErr)
            errors.push(`Conta ${pAccount.name}: ${msg}`)
          }
        }
      } catch (itemErr) {
        const msg = itemErr instanceof Error ? itemErr.message : 'Item sync error'
        console.error(`Item ${itemId} error:`, itemErr)
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
      }).then(({ error }) => {
        if (error) console.error('Sync log insert error:', error)
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
