ALTER TABLE "Container"
ADD COLUMN "name" TEXT;

UPDATE "Container"
SET "name" = regexp_replace(
  trim(BOTH FROM COALESCE(
    metadata -> 'labels' ->> 'hautech.ai/name',
    metadata ->> 'name',
    metadata ->> 'Name',
    metadata -> 'inspect' ->> 'Name',
    metadata -> 'docker' ->> 'Name',
    metadata -> 'container' ->> 'Name',
    metadata -> 'container' ->> 'name',
    metadata -> 'details' ->> 'Name',
    metadata -> 'details' ->> 'name',
    '/' || "containerId"
  )),
  '^/+',''
)
WHERE "name" IS NULL;

ALTER TABLE "Container"
ALTER COLUMN "name" SET NOT NULL;
