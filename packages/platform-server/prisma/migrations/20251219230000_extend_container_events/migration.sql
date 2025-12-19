-- Extend container event lifecycle tracking and capture health status
DO $$ BEGIN
  ALTER TYPE "ContainerEventType" ADD VALUE IF NOT EXISTS 'create';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContainerEventType" ADD VALUE IF NOT EXISTS 'start';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContainerEventType" ADD VALUE IF NOT EXISTS 'stop';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContainerEventType" ADD VALUE IF NOT EXISTS 'destroy';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContainerEventType" ADD VALUE IF NOT EXISTS 'restart';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ContainerEventType" ADD VALUE IF NOT EXISTS 'health_status';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ContainerEvent"
  ADD COLUMN IF NOT EXISTS "health" TEXT;
