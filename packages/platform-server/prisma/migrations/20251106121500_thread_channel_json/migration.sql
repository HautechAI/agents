-- Add JSONB channel info to Thread for channel-agnostic messaging
ALTER TABLE "Thread" ADD COLUMN "channel" JSONB;

