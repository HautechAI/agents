-- Add nullable channel and channelVersion to Thread.
-- Safe migration: columns are nullable; no defaults; minimal lock.
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "channel" JSONB;
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "channelVersion" INTEGER;

