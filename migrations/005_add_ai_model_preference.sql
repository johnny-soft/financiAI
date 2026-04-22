-- migrations/005_add_ai_model_preference.sql

-- Adiciona a coluna ai_model na tabela profiles se ela ainda não existir.
-- Utiliza "gemini-3.0-flash-lite" como um padrão rápido, até o usuário realizar sua escolha no frontend.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gemini-3.0-flash-lite';
