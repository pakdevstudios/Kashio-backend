CREATE TABLE "cart_item_variations" (
  "id" TEXT NOT NULL,
  "cartItemId" TEXT NOT NULL,
  "variationOptionId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cart_item_variations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "cart_item_variations" (
  "id", "cartItemId", "variationOptionId", "quantity", "unitPrice", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  "id",
  "variationOptionId",
  1,
  COALESCE("unitPrice", 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "cart_items"
WHERE "variationOptionId" IS NOT NULL;

CREATE INDEX "cart_item_variations_cartItemId_idx" ON "cart_item_variations"("cartItemId");
CREATE INDEX "cart_item_variations_variationOptionId_idx" ON "cart_item_variations"("variationOptionId");

ALTER TABLE "cart_item_variations"
  ADD CONSTRAINT "cart_item_variations_cartItemId_fkey"
  FOREIGN KEY ("cartItemId") REFERENCES "cart_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_item_variations"
  ADD CONSTRAINT "cart_item_variations_variationOptionId_fkey"
  FOREIGN KEY ("variationOptionId") REFERENCES "product_variation_options"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
