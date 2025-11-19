-- CreateEnum
CREATE TYPE "ToolOutputSource" AS ENUM ('stdout', 'stderr');

-- CreateEnum
CREATE TYPE "ToolOutputStatus" AS ENUM ('success', 'error', 'timeout', 'idle_timeout', 'cancelled', 'truncated');

-- CreateTable
CREATE TABLE "tool_output_chunks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "seq_global" INTEGER NOT NULL,
    "seq_stream" INTEGER NOT NULL,
    "source" "ToolOutputSource" NOT NULL,
    "data" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_output_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_output_terminals" (
    "event_id" UUID NOT NULL,
    "exit_code" INTEGER,
    "status" "ToolOutputStatus" NOT NULL,
    "bytes_stdout" INTEGER NOT NULL DEFAULT 0,
    "bytes_stderr" INTEGER NOT NULL DEFAULT 0,
    "total_chunks" INTEGER NOT NULL DEFAULT 0,
    "dropped_chunks" INTEGER NOT NULL DEFAULT 0,
    "saved_path" TEXT,
    "message" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_output_terminals_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tool_output_chunks_event_id_seq_global_key" ON "tool_output_chunks"("event_id", "seq_global");

-- CreateIndex
CREATE INDEX "tool_output_chunks_event_id_seq_global_idx" ON "tool_output_chunks"("event_id", "seq_global");

-- CreateIndex
CREATE INDEX "tool_output_chunks_event_id_source_seq_stream_idx" ON "tool_output_chunks"("event_id", "source", "seq_stream");

-- AddForeignKey
ALTER TABLE "tool_output_chunks" ADD CONSTRAINT "tool_output_chunks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_output_terminals" ADD CONSTRAINT "tool_output_terminals_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "run_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
