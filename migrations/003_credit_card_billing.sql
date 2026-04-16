-- ============================================
-- FinTrack - PATCH: Credit card billing cycle
-- Run this in Supabase SQL Editor
-- ============================================

-- Add billing cycle fields to accounts (for credit cards)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS closing_day INT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_day INT;

-- closing_day = day of month when the bill closes (e.g., 15)
-- due_day = day of month when payment is due (e.g., 25)
