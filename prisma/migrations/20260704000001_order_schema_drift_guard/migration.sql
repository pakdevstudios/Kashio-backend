ALTER TABLE "couriers"
  ADD COLUMN IF NOT EXISTS "price" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'courier_order_items'
  ) THEN
    ALTER TABLE "courier_order_items"
      ADD COLUMN IF NOT EXISTS "price" INTEGER;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courier_order_items'
        AND column_name = 'unitPrice'
    ) THEN
      UPDATE "courier_order_items"
      SET "price" = COALESCE("price", "unitPrice");
    END IF;

    UPDATE "courier_order_items"
    SET "price" = 0
    WHERE "price" IS NULL;

    ALTER TABLE "courier_order_items"
      ALTER COLUMN "price" SET NOT NULL;
  END IF;
END $$;
