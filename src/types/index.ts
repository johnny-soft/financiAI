// ============================================
// FinTrack - Types
// ============================================

export type TransactionType = 'income' | 'expense' | 'transfer'
export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'wallet' | 'other'
export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled'
export type GoalCategory = 'emergency' | 'travel' | 'purchase' | 'investment' | 'debt' | 'other'
export type InsightType = 'saving' | 'spending' | 'goal' | 'alert' | 'general'
export type InsightPriority = 'low' | 'medium' | 'high'
export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'cash' | 'transfer' | 'boleto' | 'other'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  monthly_income: number
  currency: string
  pluggy_item_ids: string[]
  ai_auto_categorization?: boolean
  ai_model?: string
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  type: 'income' | 'expense' | 'both'
  goal_id?: string | null
  is_default: boolean
  is_extraordinary?: boolean
  created_at: string
}

export interface Account {
  id: string
  user_id: string
  pluggy_account_id: string | null
  pluggy_item_id: string | null
  name: string
  institution: string | null
  institution_logo: string | null
  type: AccountType
  balance: number
  credit_limit: number | null
  currency: string
  is_active: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string | null
  category_id: string | null
  pluggy_transaction_id: string | null
  description: string
  amount: number
  type: TransactionType
  date: string
  notes: string | null
  tags: string[]
  is_recurring: boolean
  is_extraordinary: boolean
  recurrence_rule: string | null
  payment_method: PaymentMethod
  source: 'pluggy' | 'manual' | 'import'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined
  category?: Category
  account?: Account
}

export interface Goal {
  id: string
  user_id: string
  title: string
  description: string | null
  icon: string
  target_amount: number
  current_amount: number
  target_date: string | null
  category: GoalCategory
  status: GoalStatus
  created_at: string
  updated_at: string
}

export interface GoalContribution {
  id: string
  goal_id: string
  user_id: string
  amount: number
  note: string | null
  date: string
  created_at: string
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  month: number
  year: number
  created_at: string
  // Joined / computed
  category?: Category
  spent?: number
}

export interface AIInsight {
  id: string
  user_id: string
  type: InsightType
  title: string
  content: string
  priority: InsightPriority
  is_read: boolean
  is_dismissed: boolean
  metadata: Record<string, unknown>
  generated_at: string
}

// Dashboard summary types
export interface DashboardSummary {
  totalBalance: number
  totalCreditDebt: number
  monthIncome: number
  monthExpense: number
  monthBalance: number
  savingsRate: number
  accounts: Account[]
  recentTransactions: Transaction[]
  topCategories: CategorySpending[]
  monthlyTrend: MonthlyBalance[]
  unreadInsights: number
}

export interface CategorySpending {
  category_id: string
  category_name: string
  category_icon: string
  category_color: string
  total: number
  percentage?: number
}

export interface MonthlyBalance {
  month: string
  income: number
  expense: number
  balance: number
}

// Pluggy types
export interface PluggyAccount {
  id: string
  itemId: string
  name: string
  number: string | null
  balance: number
  currencyCode: string
  type: string
  subtype: string
  institution: {
    name: string
    imageUrl: string | null
  }
}

export interface PluggyTransaction {
  id: string
  accountId: string
  description: string
  currencyCode: string
  amount: number
  date: string
  type: 'CREDIT' | 'DEBIT'
  category: string | null
  paymentData: {
    payer?: { name?: string }
    receiver?: { name?: string }
    paymentMethod?: string
  } | null
}

// API response types
export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface SyncResult {
  accountsSynced: number
  transactionsSynced: number
  errors: string[]
}
