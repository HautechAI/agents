-- Drop legacy memory tables and initialize adjacency-list memory_entities storage
DROP TABLE IF EXISTS "memory_entities" CASCADE;
DROP TABLE IF EXISTS "memory_entries" CASCADE;
DROP TABLE IF EXISTS "memories" CASCADE;

CREATE TABLE "memory_entities" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "parent_id" UUID NULL REFERENCES "memory_entities"("id") ON DELETE CASCADE,
    "node_id" TEXT NOT NULL,
    "thread_id" TEXT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_memory_name_no_slash" CHECK (POSITION('/' IN "name") = 0)
);

CREATE UNIQUE INDEX "uniq_memory_entity_path"
  ON "memory_entities"("node_id", "thread_id", "parent_id", "name");

CREATE INDEX "idx_memory_entity_parent"
  ON "memory_entities"("node_id", "thread_id", "parent_id");

COMMENT ON TABLE "memory_entities" IS 'Memory adjacency list with optional content per entity';
