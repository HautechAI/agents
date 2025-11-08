-- Add nullable channel to Thread.
-- Safe migration: columns are nullable; no defaults; minimal lock.
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "channel" JSONB;
