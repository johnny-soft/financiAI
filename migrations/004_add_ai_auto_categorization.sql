-- ============================================
-- 004_add_ai_auto_categorization.sql
-- ============================================

ALTER TABLE profiles
ADD COLUMN ai_auto_categorization BOOLEAN DEFAULT FALSE;
