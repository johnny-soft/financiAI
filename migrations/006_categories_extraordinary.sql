-- ============================================
-- FinAI - Migration 006: Extraordinary Flag on Categories
-- Run this in Supabase SQL Editor
-- ============================================

ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_extraordinary BOOLEAN DEFAULT FALSE;
