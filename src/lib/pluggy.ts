// ============================================
// Pluggy API Integration
// Uses Meu Pluggy OAuth flow for personal use
// ============================================

import type { PluggyAccount, PluggyTransaction } from '@/types'

const PLUGGY_BASE_URL = 'https://api.pluggy.ai'

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getPluggyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const clientId = process.env.PLUGGY_CLIENT_ID
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET must be set in environment variables')
  }

  const res = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  })

  if (!res.ok) {
    throw new Error(`Pluggy auth failed: ${res.statusText}`)
  }

  const { apiKey } = await res.json()
  cachedToken = {
    token: apiKey,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2h
  }

  return apiKey
}

export async function pluggyFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = await getPluggyToken()

  const res = await fetch(`${PLUGGY_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': token,
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Pluggy API error ${res.status}: ${error}`)
  }

  return res.json()
}

// Get all items (connected bank connections)
export async function getPluggyItems() {
  const data = await pluggyFetch<{ results: Array<{ id: string; connector: { name: string; imageUrl?: string } }> }>('/items')
  return data.results
}

// Get a single item
export async function getPluggyItem(itemId: string) {
  return pluggyFetch<{ id: string; status: { code: string }; connector: { name: string; imageUrl?: string } }>(`/items/${itemId}`)
}

// Get accounts for an item
export async function getPluggyAccounts(itemId: string): Promise<PluggyAccount[]> {
  const data = await pluggyFetch<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)
  return data.results
}

// Get transactions for an account
export async function getPluggyTransactions(
  accountId: string,
  from?: string,
  to?: string
): Promise<PluggyTransaction[]> {
  const params = new URLSearchParams({ accountId })
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  params.set('pageSize', '500')

  const data = await pluggyFetch<{ results: PluggyTransaction[]; total: number }>(
    `/transactions?${params}`
  )
  return data.results
}

// Create a Connect Token for frontend widget
export async function createConnectToken(itemId?: string) {
  const body: Record<string, unknown> = {}
  if (itemId) body.itemId = itemId

  const data = await pluggyFetch<{ accessToken: string }>('/connect_token', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return data.accessToken
}

// Map Pluggy account type to our AccountType
export function mapPluggyAccountType(type: string, subtype: string): string {
  const map: Record<string, string> = {
    BANK: 'checking',
    CREDIT: 'credit',
    INVESTMENT: 'investment',
  }

  if (subtype === 'SAVINGS_ACCOUNT') return 'savings'
  return map[type] || 'other'
}

// Pluggy category → our category name mapping
export const PLUGGY_CATEGORY_MAP: Record<string, string> = {
  // Food
  'Restaurants': 'Alimentação',
  'Restaurants and Bars': 'Alimentação',
  'Food and Grocery': 'Alimentação',
  'Groceries': 'Alimentação',
  'Fast Food': 'Alimentação',
  // Transport
  'Transportation': 'Transporte',
  'Transport': 'Transporte',
  'Gas': 'Transporte',
  'Parking': 'Transporte',
  'Tolls': 'Transporte',
  'Uber': 'Transporte',
  'Ride Sharing': 'Transporte',
  // Home
  'Housing': 'Moradia',
  'Rent': 'Moradia',
  'Utilities': 'Moradia',
  'Home Improvement': 'Moradia',
  // Health
  'Health': 'Saúde',
  'Healthcare': 'Saúde',
  'Pharmacy': 'Saúde',
  'Medical': 'Saúde',
  // Education
  'Education': 'Educação',
  'Books': 'Educação',
  // Entertainment
  'Entertainment': 'Lazer',
  'Recreation': 'Lazer',
  'Sports': 'Lazer',
  'Games': 'Lazer',
  'Travel': 'Lazer',
  // Clothing
  'Clothing': 'Vestuário',
  'Shopping': 'Vestuário',
  // Subscriptions
  'Subscriptions': 'Assinaturas',
  'Digital Services': 'Assinaturas',
  'Streaming': 'Assinaturas',
  // Investments
  'Investments': 'Investimentos',
  'Savings': 'Investimentos',
  // Income
  'Salary': 'Salário',
  'Wages': 'Salário',
  'Freelance': 'Freelance',
  'Interest': 'Rendimentos',
  'Dividends': 'Rendimentos',
  'Returns': 'Rendimentos',
}

// Descriptions/keywords that indicate a transfer (not income/expense)
const TRANSFER_KEYWORDS = [
  'transferencia entre contas', 'transferência entre contas',
  'pagamento de fatura', 'pgto fatura', 'pag fatura',
  'pagamento cartao', 'pagamento cartão',
  'resgate', 'aplicação', 'aplicacao',
  'transferência própria', 'transferencia propria',
  'pix enviado', 'pix recebido',
]

function isTransfer(description: string, category?: string): boolean {
  const desc = description.toLowerCase()
  // Check known transfer patterns
  if (TRANSFER_KEYWORDS.some(kw => desc.includes(kw))) return true
  // Pluggy category indicates transfer
  if (category && ['Transfer', 'Transfers', 'Credit Card Payment'].includes(category)) return true
  return false
}

export function mapPluggyTransaction(tx: PluggyTransaction) {
  const isCredit = tx.type === 'CREDIT'
  const pluggyCategory = tx.category || ''

  // Determine transaction type: income, expense, or transfer
  let type: 'income' | 'expense' | 'transfer'
  if (isTransfer(tx.description, pluggyCategory)) {
    type = 'transfer'
  } else if (isCredit) {
    type = 'income'
  } else {
    type = 'expense'
  }

  return {
    pluggy_transaction_id: tx.id,
    description: tx.description,
    amount: Math.abs(tx.amount),
    type,
    date: tx.date.split('T')[0],
    payment_method: mapPaymentMethod(tx.paymentData?.paymentMethod),
    source: 'pluggy' as const,
    pluggy_category: pluggyCategory, // exposed for auto-categorization
    metadata: { pluggy_category: pluggyCategory },
  }
}

function mapPaymentMethod(method?: string): string {
  if (!method) return 'other'
  const map: Record<string, string> = {
    PIX: 'pix',
    CREDIT_CARD: 'credit',
    DEBIT_CARD: 'debit',
    TED: 'transfer',
    DOC: 'transfer',
    BOLETO: 'boleto',
  }
  return map[method.toUpperCase()] || 'other'
}
