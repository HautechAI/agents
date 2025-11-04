-- CreateIndex
CREATE INDEX "Thread_parentId_idx" ON "Thread"("parentId");

-- Backfill parentId based on alias convention: parent__child
-- Set child.parentId to the id of the thread whose alias equals the prefix before '__'
UPDATE "Thread" AS child
SET "parentId" = parent."id"
FROM "Thread" AS parent
WHERE POSITION('__' IN child."alias") > 0
  AND parent."alias" = split_part(child."alias", '__', 1)
  AND child."parentId" IS NULL;
