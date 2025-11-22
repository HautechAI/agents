-- Drop legacy memories table and replace with file-per-row storage
DROP TABLE IF EXISTS "memory_entries" CASCADE;
DROP TABLE IF EXISTS "memories" CASCADE;

CREATE TABLE "memory_entries" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "node_id" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "thread_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parent_path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "uniq_memory_entry_path"
  ON "memory_entries"("node_id", "scope", "thread_id", "path");

CREATE INDEX "idx_memory_entry_parent"
  ON "memory_entries"("node_id", "scope", "thread_id", "parent_path");

CREATE INDEX "idx_memory_entry_depth"
  ON "memory_entries"("node_id", "scope", "thread_id", "depth");

COMMENT ON TABLE "memory_entries" IS 'String memory entries stored per file path';
