-- ============================================
-- FinAI - CONSOLIDATED FULL SCHEMA (V2)
-- Includes: Baseline + Goals + Transfers + AI Cache + Extraordinary Txs
-- Run this in Supabase SQL Editor for a fresh start
-- ============================================

-- 1. CLEANUP (Standard order)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
DROP TRIGGER IF EXISTS update_goals_updated_at ON goals;

DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS get_spending_by_category(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_monthly_balance(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS increment_hash_hit(UUID, TEXT) CASCADE;

DROP TABLE IF EXISTS category_hash_map CASCADE;
DROP TABLE IF EXISTS pluggy_sync_log CASCADE;
DROP TABLE IF EXISTS ai_insights CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS goal_contributions CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  monthly_income DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  pluggy_item_ids TEXT[] DEFAULT '{}',
  ai_auto_categorization BOOLEAN DEFAULT TRUE,
  ai_model TEXT DEFAULT 'gemini-3.0-flash-lite',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '💰',
  color TEXT DEFAULT '#6366f1',
  type TEXT CHECK (type IN ('income', 'expense', 'both')) DEFAULT 'expense',
  goal_id UUID, -- Virtual link for goals-as-categories
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  pluggy_account_id TEXT UNIQUE,
  pluggy_item_id TEXT,
  name TEXT NOT NULL,
  institution TEXT,
  institution_logo TEXT,
  type TEXT CHECK (type IN ('checking', 'savings', 'credit', 'investment', 'wallet', 'other')) DEFAULT 'checking',
  balance DECIMAL(12,2) DEFAULT 0,
  credit_limit DECIMAL(12,2),
  closing_day INT, -- Credit card billing
  due_day INT,      -- Credit card payment
  currency TEXT DEFAULT 'BRL',
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  pluggy_transaction_id TEXT UNIQUE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type TEXT CHECK (type IN ('income', 'expense', 'transfer')) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  is_extraordinary BOOLEAN DEFAULT FALSE, -- Exclude from averages
  payment_method TEXT DEFAULT 'other',
  source TEXT DEFAULT 'manual',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '🎯',
  target_amount DECIMAL(12,2) NOT NULL,
  current_amount DECIMAL(12,2) DEFAULT 0,
  target_date DATE,
  category TEXT DEFAULT 'other',
  status TEXT CHECK (status IN ('active', 'completed', 'paused', 'cancelled')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE category_hash_map (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  description_normalized TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  hit_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, description_normalized)
);

CREATE TABLE ai_insights (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('saving', 'spending', 'goal', 'alert', 'general')) DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE goal_contributions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  goal_id UUID REFERENCES goals(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budgets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  month INT CHECK (month BETWEEN 1 AND 12) NOT NULL,
  year INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category_id, month, year)
);

CREATE TABLE pluggy_sync_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('success', 'error', 'partial')) NOT NULL,
  transactions_synced INT DEFAULT 0,
  error_message TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pluggy_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_hash_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can manage own categories" ON categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own accounts" ON accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own transactions" ON transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own goals" ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own contributions" ON goal_contributions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own budgets" ON budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sync logs" ON pluggy_sync_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own hash map" ON category_hash_map FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own insights" ON ai_insights FOR ALL USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_hash_map_lookup ON category_hash_map(user_id, description_normalized);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- 1. Profile & Defaults
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');

  INSERT INTO public.categories (user_id, name, icon, color, type, is_default) VALUES
    (NEW.id, 'Alimentação', '🍔', '#f59e0b', 'expense', true),
    (NEW.id, 'Transporte', '🚗', '#3b82f6', 'expense', true),
    (NEW.id, 'Moradia', '🏠', '#8b5cf6', 'expense', true),
    (NEW.id, 'Saúde', '❤️', '#ef4444', 'expense', true),
    (NEW.id, 'Lazer', '🎮', '#ec4899', 'expense', true),
    (NEW.id, 'Investimentos', '📈', '#10b981', 'expense', true),
    (NEW.id, 'Salário', '💼', '#10b981', 'income', true),
    (NEW.id, 'Outros', '💸', '#6b7280', 'expense', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. Financial Analytics (Excludes transfers, goals and extraordinary)
CREATE OR REPLACE FUNCTION get_spending_by_category(
  p_user_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE(category_id UUID, category_name TEXT, category_icon TEXT, category_color TEXT, total DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.name, c.icon, c.color,
    COALESCE(SUM(t.amount), 0) as total
  FROM categories c
  LEFT JOIN transactions t ON t.category_id = c.id
    AND t.user_id = p_user_id
    AND t.type = 'expense'
    AND t.is_extraordinary = false
    AND t.date BETWEEN p_start AND p_end
  WHERE c.user_id = p_user_id
    AND c.type IN ('expense', 'both')
    AND c.goal_id IS NULL -- Exclude goal-allocation categories from spending
  GROUP BY c.id, c.name, c.icon, c.color
  HAVING COALESCE(SUM(t.amount), 0) > 0
  ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_monthly_balance(
  p_user_id UUID,
  p_months INT DEFAULT 6
)
RETURNS TABLE(month TEXT, income DECIMAL, expense DECIMAL, balance DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') as month,
    COALESCE(SUM(CASE WHEN t.type = 'income' AND t.is_extraordinary = false THEN t.amount ELSE 0 END), 0) as income,
    COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.is_extraordinary = false AND c.goal_id IS NULL THEN t.amount ELSE 0 END), 0) as expense,
    COALESCE(SUM(CASE
      WHEN t.type = 'income' AND t.is_extraordinary = false THEN t.amount
      WHEN t.type = 'expense' AND t.is_extraordinary = false AND c.goal_id IS NULL THEN -t.amount
      ELSE 0
    END), 0) as balance
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.user_id = p_user_id
    AND t.type IN ('income', 'expense')
    AND t.date >= DATE_TRUNC('month', NOW() - (p_months - 1 || ' months')::INTERVAL)
  GROUP BY DATE_TRUNC('month', t.date)
  ORDER BY DATE_TRUNC('month', t.date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Cache Hits Counter
CREATE OR REPLACE FUNCTION increment_hash_hit(p_user_id UUID, p_key TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE category_hash_map 
  SET hit_count = hit_count + 1, updated_at = NOW()
  WHERE user_id = p_user_id AND description_normalized = p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
