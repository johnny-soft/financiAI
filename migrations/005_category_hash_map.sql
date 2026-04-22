-- ============================================
-- FinAI - Migration 005: Category Hash Map Cache + RLS
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Category hash map for AI cache / self-learning
CREATE TABLE IF NOT EXISTS category_hash_map (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  description_normalized TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  hit_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, description_normalized)
);

ALTER TABLE category_hash_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own hash map" ON category_hash_map
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_hash_map_lookup ON category_hash_map(user_id, description_normalized);
