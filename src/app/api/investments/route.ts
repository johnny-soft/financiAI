import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPluggyInvestments } from '@/lib/pluggy'
import type { Investment, PluggyInvestment } from '@/types'

export const dynamic = 'force-dynamic'

const TYPE_LABELS: Record<string, string> = {
  FIXED_INCOME: 'Renda Fixa',
  MUTUAL_FUND: 'Fundos',
  EQUITY: 'Renda Variável',
  ETF: 'ETF',
  COE: 'COE',
  OTHER: 'Outros',
}

const SUBTYPE_LABELS: Record<string, string> = {
  CDB: 'CDB',
  LCI: 'LCI',
  LCA: 'LCA',
  LC: 'LC',
  CRI: 'CRI',
  CRA: 'CRA',
  DEBENTURES: 'Debêntures',
  TREASURY: 'Tesouro Direto',
  LIG: 'LIG',
  LF: 'LF',
  FIXED_INCOME_FUND: 'Fundo RF',
  FIP: 'FIP',
  OFFSHORE: 'Offshore',
  ETF: 'ETF',
  STOCK: 'Ações',
  BDR: 'BDR',
  REAL_ESTATE_FUND: 'FII',
  DERIVATIVES: 'Derivativos',
  OPTION: 'Opções',
}

function mapPluggyInvestment(inv: PluggyInvestment, institution: string): Investment {
  return {
    id: inv.id,
    name: inv.name,
    type: TYPE_LABELS[inv.type] || inv.type,
    subtype: SUBTYPE_LABELS[inv.subtype || ''] || inv.subtype || inv.type,
    amount: inv.amount,
    taxes: inv.taxes,
    netAmount: inv.amount - inv.taxes,
    date: inv.date?.split('T')[0] || '',
    quantity: inv.quantity,
    unitValue: inv.value,
    annualRate: inv.annualRate,
    lastMonthRate: inv.lastMonthRate,
    last12mRate: inv.lastTwelveMonthsRate,
    institution,
    currencyCode: inv.currencyCode || 'BRL',
  }
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get user's Pluggy items
    const { data: profile } = await supabase
      .from('profiles')
      .select('pluggy_item_ids')
      .eq('id', user.id)
      .single()

    const itemIds: string[] = profile?.pluggy_item_ids ?? []

    if (itemIds.length === 0) {
      return NextResponse.json({ data: { investments: [], summary: null } })
    }

    // Get institution names from accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('pluggy_item_id, institution')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const itemInstitution: Record<string, string> = {}
    for (const acc of accounts ?? []) {
      if (acc.pluggy_item_id && acc.institution) {
        itemInstitution[acc.pluggy_item_id] = acc.institution
      }
    }

    // Fetch investments from all items
    const allInvestments: Investment[] = []
    const errors: string[] = []

    for (const itemId of itemIds) {
      try {
        const pluggyInvestments = await getPluggyInvestments(itemId)
        const institution = itemInstitution[itemId] || 'Desconhecido'
        const mapped = pluggyInvestments.map(inv => mapPluggyInvestment(inv, institution))
        allInvestments.push(...mapped)
      } catch (err) {
        console.error(`Failed to fetch investments for item ${itemId}:`, err)
        errors.push(`Item ${itemId}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
      }
    }

    // Get emergency reserve goals
    const { data: emergencyGoals } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('category', 'emergency')
      .in('status', ['active', 'completed'])

    // Get average monthly expense for "months covered" calculation
    const { data: monthlyData } = await supabase.rpc('get_monthly_balance', {
      p_user_id: user.id,
      p_months: 6,
    })

    const monthlyExpenses = (monthlyData ?? []).map((row: { expense: number }) =>
      parseFloat(String(row.expense)) || 0
    )
    const avgMonthlyExpense = monthlyExpenses.length > 0
      ? monthlyExpenses.reduce((a: number, b: number) => a + b, 0) / monthlyExpenses.length
      : 0

    // Build summary
    const totalInvested = allInvestments.reduce((a, i) => a + i.amount, 0)
    const totalTaxes = allInvestments.reduce((a, i) => a + i.taxes, 0)
    const totalNet = totalInvested - totalTaxes

    // Group by type
    const byType: Record<string, { total: number; count: number }> = {}
    for (const inv of allInvestments) {
      if (!byType[inv.type]) byType[inv.type] = { total: 0, count: 0 }
      byType[inv.type].total += inv.amount
      byType[inv.type].count++
    }

    return NextResponse.json({
      data: {
        investments: allInvestments,
        emergencyReserves: emergencyGoals ?? [],
        summary: {
          totalInvested: Math.round(totalInvested * 100) / 100,
          totalTaxes: Math.round(totalTaxes * 100) / 100,
          totalNet: Math.round(totalNet * 100) / 100,
          count: allInvestments.length,
          byType,
          avgMonthlyExpense: Math.round(avgMonthlyExpense * 100) / 100,
        },
        errors: errors.length > 0 ? errors : undefined,
      }
    })
  } catch (err) {
    console.error('Investments API error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
