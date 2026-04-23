-- ============================================
-- MIGRATION: Auto-create Emergency Reserve Goal
-- For EXISTING users who don't have one yet
-- Run this ONCE in Supabase SQL Editor
-- ============================================

-- 1. Update handle_new_user function for NEW users
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

  -- Auto-create Emergency Reserve goal
  INSERT INTO public.goals (user_id, title, description, icon, target_amount, current_amount, category, status)
  VALUES (NEW.id, 'Reserva de Emergência', 'Fundo de emergência para cobrir 6 meses de despesas essenciais.', '🛡️', 10000, 0, 'emergency', 'active');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create emergency reserve for EXISTING users who don't have one
INSERT INTO public.goals (user_id, title, description, icon, target_amount, current_amount, category, status)
SELECT p.id, 'Reserva de Emergência', 'Fundo de emergência para cobrir 6 meses de despesas essenciais.', '🛡️', 10000, 0, 'emergency', 'active'
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM goals g WHERE g.user_id = p.id AND g.category = 'emergency'
);
