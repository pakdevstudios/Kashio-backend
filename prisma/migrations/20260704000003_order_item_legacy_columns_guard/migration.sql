DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'courier_order_items'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courier_order_items'
        AND column_name = 'unitPrice'
    ) THEN
      UPDATE "courier_order_items"
      SET "unitPrice" = COALESCE("unitPrice", "price", 0);

      ALTER TABLE "courier_order_items"
        ALTER COLUMN "unitPrice" SET DEFAULT 0,
        ALTER COLUMN "unitPrice" DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courier_order_items'
        AND column_name = 'lineTotal'
    ) THEN
      UPDATE "courier_order_items"
      SET "lineTotal" = COALESCE("lineTotal", "price" * "quantity", 0);

      ALTER TABLE "courier_order_items"
        ALTER COLUMN "lineTotal" SET DEFAULT 0,
        ALTER COLUMN "lineTotal" DROP NOT NULL;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'courier_order_items'
        AND column_name = 'snapshot'
    ) THEN
      UPDATE "courier_order_items"
      SET "snapshot" = COALESCE("snapshot", '{}'::jsonb);

      ALTER TABLE "courier_order_items"
        ALTER COLUMN "snapshot" SET DEFAULT '{}'::jsonb,
        ALTER COLUMN "snapshot" DROP NOT NULL;
    END IF;
  END IF;
END $$;
