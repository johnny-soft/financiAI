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

// Get transactions for an account (with pagination to get ALL)
export async function getPluggyTransactions(
  accountId: string,
  from?: string,
  to?: string
): Promise<PluggyTransaction[]> {
  const allTransactions: PluggyTransaction[] = []
  let page = 1
  const pageSize = 500

  while (true) {
    const params = new URLSearchParams({ accountId })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('pageSize', String(pageSize))
    params.set('page', String(page))

    const data = await pluggyFetch<{ results: PluggyTransaction[]; total: number; page: number; totalPages: number }>(
      `/transactions?${params}`
    )

    allTransactions.push(...data.results)

    // Stop if we got all transactions
    if (allTransactions.length >= data.total || data.results.length < pageSize) {
      break
    }
    page++
  }

  return allTransactions
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

// Descriptions/keywords that indicate an INTER-ACCOUNT transfer (not real income/expense)
// PIX enviado/recebido are NOT included — they are real payments/income in most cases
const TRANSFER_KEYWORDS = [
  'transferencia entre contas', 'transferência entre contas',
  'pagamento de fatura', 'pgto fatura', 'pag fatura',
  'pagamento cartao', 'pagamento cartão',
  'resgate automatico', 'aplicação automática', 'aplicacao automatica',
  'transferência própria', 'transferencia propria',
  'movimentação interna', 'movimentacao interna',
]

function isTransfer(description: string, category?: string): boolean {
  const desc = description.toLowerCase()
  // Check known inter-account transfer patterns
  if (TRANSFER_KEYWORDS.some(kw => desc.includes(kw))) return true
  // Pluggy category explicitly indicates transfer
  if (category && ['Transfer', 'Transfers', 'Credit Card Payment'].includes(category)) return true
  return false
}

export function mapPluggyTransaction(tx: PluggyTransaction, accountType?: string) {
  const isCredit = tx.type === 'CREDIT'
  const isPositiveAmount = tx.amount > 0
  const pluggyCategory = tx.category || ''

  // Extract CPF/CNPJ from payer and receiver
  const payerDoc = tx.paymentData?.payer?.documentNumber?.value ?? null
  const receiverDoc = tx.paymentData?.receiver?.documentNumber?.value ?? null
  const payerName = tx.paymentData?.payer?.name ?? null
  const receiverName = tx.paymentData?.receiver?.name ?? null

  // Determine transaction type: income, expense, or transfer
  let type: 'income' | 'expense' | 'transfer'

  if (accountType === 'credit') {
    // Credit card account logic:
    // CREDIT on a card = payment received or refund → always a transfer
    // DEBIT on a card = purchase → expense
    type = isCredit ? 'transfer' : 'expense'
  } else if (isTransfer(tx.description, pluggyCategory)) {
    type = 'transfer'
  } else if (payerDoc && receiverDoc && normalizeCpf(payerDoc) === normalizeCpf(receiverDoc)) {
    // Same CPF on both sides = self-transfer between own accounts
    type = 'transfer'
  } else if (isCredit || isPositiveAmount) {
    // Money coming IN: Pluggy says CREDIT or amount is positive → income
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
    pluggy_category: pluggyCategory,
    metadata: {
      pluggy_category: pluggyCategory,
      payer_cpf: payerDoc,
      receiver_cpf: receiverDoc,
      payer_name: payerName,
      receiver_name: receiverName,
    },
  }
}

/**
 * Normalize a CPF/CNPJ string by stripping all non-digit characters.
 * "882.937.076-23" → "88293707623"
 */
function normalizeCpf(doc: string): string {
  return doc.replace(/\D/g, '')
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
