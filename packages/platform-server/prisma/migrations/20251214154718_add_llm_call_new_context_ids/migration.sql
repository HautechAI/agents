-- AlterTable
ALTER TABLE "llm_calls" ADD COLUMN     "new_context_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
