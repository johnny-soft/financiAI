-- ============================================
-- FinAI - Migration 003: Exclude transfers from balance/spending RPCs
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Update get_monthly_balance to exclude transfers
CREATE OR REPLACE FUNCTION get_monthly_balance(
  p_user_id UUID,
  p_months INT DEFAULT 6
)
RETURNS TABLE(month TEXT, income DECIMAL, expense DECIMAL, balance DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') as month,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as expense,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END), 0) as balance
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.type IN ('income', 'expense')
    AND t.date >= DATE_TRUNC('month', NOW() - (p_months - 1 || ' months')::INTERVAL)
  GROUP BY DATE_TRUNC('month', t.date)
  ORDER BY DATE_TRUNC('month', t.date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update get_spending_by_category to be explicit (already correct but reinforce)
CREATE OR REPLACE FUNCTION get_spending_by_category(
  p_user_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE(category_id UUID, category_name TEXT, category_icon TEXT, category_color TEXT, total DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    COALESCE(SUM(t.amount), 0) as total
  FROM categories c
  LEFT JOIN transactions t ON t.category_id = c.id
    AND t.user_id = p_user_id
    AND t.type = 'expense'
    AND t.date BETWEEN p_start AND p_end
  WHERE c.user_id = p_user_id AND c.type IN ('expense', 'both')
  GROUP BY c.id, c.name, c.icon, c.color
  ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
