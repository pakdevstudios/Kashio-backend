DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'courier_order_items'
  ) THEN
    ALTER TABLE "courier_order_items"
      ADD COLUMN IF NOT EXISTS "selectedVariant" TEXT;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courier_order_items'
        AND column_name = 'variantName'
    ) THEN
      UPDATE "courier_order_items"
      SET "selectedVariant" = COALESCE("selectedVariant", "variantName");
    END IF;
  END IF;
END $$;
