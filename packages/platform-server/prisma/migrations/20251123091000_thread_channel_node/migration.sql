-- Rename trigger_node_id column to channel_node_id for Slack channel mapping.
ALTER TABLE "Thread" RENAME COLUMN "trigger_node_id" TO "channel_node_id";
