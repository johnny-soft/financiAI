-- ============================================
-- FinTrack - PATCH: Fix category spending + monthly trends
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Fix: spending by category should include uncategorized expenses 
--    under "Outros gastos" and exclude transfers
CREATE OR REPLACE FUNCTION get_spending_by_category(
  p_user_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE(category_id UUID, category_name TEXT, category_icon TEXT, category_color TEXT, total DECIMAL) AS $$
BEGIN
  RETURN QUERY
  -- Categorized expenses
  SELECT
    c.id,
    c.name,
    c.icon,
    c.color,
    COALESCE(SUM(t.amount), 0) as total
  FROM categories c
  INNER JOIN transactions t ON t.category_id = c.id
    AND t.user_id = p_user_id
    AND t.type = 'expense'
    AND t.date BETWEEN p_start AND p_end
  WHERE c.user_id = p_user_id
  GROUP BY c.id, c.name, c.icon, c.color

  UNION ALL

  -- Uncategorized expenses → shown as "Sem Categoria"
  SELECT
    '00000000-0000-0000-0000-000000000000'::UUID as id,
    'Sem Categoria'::TEXT as name,
    '❓'::TEXT as icon,
    '#9ca3af'::TEXT as color,
    COALESCE(SUM(t.amount), 0) as total
  FROM transactions t
  WHERE t.user_id = p_user_id
    AND t.type = 'expense'
    AND t.category_id IS NULL
    AND t.date BETWEEN p_start AND p_end
  HAVING SUM(t.amount) > 0

  ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Fix: monthly balance should exclude transfers
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
    AND t.type != 'transfer'
    AND t.date >= DATE_TRUNC('month', NOW() - (p_months - 1 || ' months')::INTERVAL)
  GROUP BY DATE_TRUNC('month', t.date)
  ORDER BY DATE_TRUNC('month', t.date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
