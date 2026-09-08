-- Public order numbers: DDMMYYYY + 3-digit daily sequence (IST), e.g. 08092026001.
ALTER TABLE "Order" ALTER COLUMN "orderNumber" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "Order_orderNumber_seq";

ALTER TABLE "Order"
  ALTER COLUMN "orderNumber" TYPE TEXT USING "orderNumber"::text;

WITH numbered AS (
  SELECT
    id,
    to_char(("createdAt" AT TIME ZONE 'Asia/Kolkata'), 'DDMMYYYY') AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY to_char(("createdAt" AT TIME ZONE 'Asia/Kolkata'), 'DDMMYYYY')
      ORDER BY "createdAt" ASC, id ASC
    ) AS seq
  FROM "Order"
)
UPDATE "Order" o
SET "orderNumber" = numbered.prefix || lpad(numbered.seq::text, 3, '0')
FROM numbered
WHERE o.id = numbered.id;
