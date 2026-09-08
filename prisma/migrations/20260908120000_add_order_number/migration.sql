-- Public sequential order numbers (start at 1001). Internal `id` stays a cuid.
CREATE SEQUENCE "Order_orderNumber_seq" START WITH 1001;

ALTER TABLE "Order" ADD COLUMN "orderNumber" INTEGER;

WITH numbered AS (
  SELECT id, 1000 + ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS n
  FROM "Order"
)
UPDATE "Order" o
SET "orderNumber" = numbered.n
FROM numbered
WHERE o.id = numbered.id;

SELECT setval(
  '"Order_orderNumber_seq"',
  GREATEST(1000, COALESCE((SELECT MAX("orderNumber") FROM "Order"), 1000))
);

ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET DEFAULT nextval('"Order_orderNumber_seq"');
ALTER SEQUENCE "Order_orderNumber_seq" OWNED BY "Order"."orderNumber";

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
