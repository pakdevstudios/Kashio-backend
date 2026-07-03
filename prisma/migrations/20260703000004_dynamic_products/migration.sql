CREATE TYPE "ProductType" AS ENUM ('SIMPLE', 'VARIABLE');
CREATE TYPE "VariationSelectionType" AS ENUM ('SINGLE', 'MULTIPLE');

ALTER TABLE "products"
  ADD COLUMN "productType" "ProductType" NOT NULL DEFAULT 'SIMPLE',
  ADD COLUMN "variationLabel" TEXT NOT NULL DEFAULT 'Variation',
  ADD COLUMN "variationSelectionType" "VariationSelectionType" NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN "isVariationRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minVariationSelections" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maxVariationSelections" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "allowSpecialInstructions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "specialInstructionsPlaceholder" TEXT,
  ADD COLUMN "specialInstructionsMaxLength" INTEGER NOT NULL DEFAULT 250;

CREATE INDEX "products_productType_idx" ON "products"("productType");

CREATE TABLE "product_variation_options" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "price" INTEGER NOT NULL,
  "salePrice" INTEGER,
  "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "minQuantity" INTEGER NOT NULL DEFAULT 1,
  "maxQuantity" INTEGER NOT NULL DEFAULT 99,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_variation_options_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_variation_options_productId_idx" ON "product_variation_options"("productId");
CREATE INDEX "product_variation_options_productId_isActive_idx" ON "product_variation_options"("productId", "isActive");
CREATE INDEX "product_variation_options_productId_displayOrder_idx" ON "product_variation_options"("productId", "displayOrder");

ALTER TABLE "product_variation_options"
  ADD CONSTRAINT "product_variation_options_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "product_frequently_bought_items" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "relatedProductId" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "minQuantity" INTEGER NOT NULL DEFAULT 1,
  "maxQuantity" INTEGER NOT NULL DEFAULT 99,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_frequently_bought_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_frequently_bought_items_productId_relatedProductId_key"
  ON "product_frequently_bought_items"("productId", "relatedProductId");
CREATE INDEX "product_frequently_bought_items_productId_idx" ON "product_frequently_bought_items"("productId");
CREATE INDEX "product_frequently_bought_items_relatedProductId_idx" ON "product_frequently_bought_items"("relatedProductId");
CREATE INDEX "product_frequently_bought_items_productId_isActive_idx" ON "product_frequently_bought_items"("productId", "isActive");

ALTER TABLE "product_frequently_bought_items"
  ADD CONSTRAINT "product_frequently_bought_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_frequently_bought_items"
  ADD CONSTRAINT "product_frequently_bought_items_relatedProductId_fkey"
  FOREIGN KEY ("relatedProductId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cart_items"
  DROP CONSTRAINT IF EXISTS "cart_items_cartId_productId_key",
  ADD COLUMN "variationOptionId" TEXT,
  ADD COLUMN "unitPrice" INTEGER,
  ADD COLUMN "specialInstructions" TEXT,
  ADD COLUMN "configKey" TEXT;

UPDATE "cart_items"
SET "unitPrice" = COALESCE("products"."discountedPrice", "products"."price"),
    "configKey" = "cart_items"."productId"
FROM "products"
WHERE "products"."id" = "cart_items"."productId";

ALTER TABLE "cart_items"
  ALTER COLUMN "configKey" SET NOT NULL;

CREATE UNIQUE INDEX "cart_items_cartId_configKey_key" ON "cart_items"("cartId", "configKey");
CREATE INDEX "cart_items_variationOptionId_idx" ON "cart_items"("variationOptionId");

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_variationOptionId_fkey"
  FOREIGN KEY ("variationOptionId") REFERENCES "product_variation_options"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "cart_item_add_ons" (
  "id" TEXT NOT NULL,
  "cartItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variationOptionId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cart_item_add_ons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cart_item_add_ons_cartItemId_idx" ON "cart_item_add_ons"("cartItemId");
CREATE INDEX "cart_item_add_ons_productId_idx" ON "cart_item_add_ons"("productId");
CREATE INDEX "cart_item_add_ons_variationOptionId_idx" ON "cart_item_add_ons"("variationOptionId");

ALTER TABLE "cart_item_add_ons"
  ADD CONSTRAINT "cart_item_add_ons_cartItemId_fkey"
  FOREIGN KEY ("cartItemId") REFERENCES "cart_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_item_add_ons"
  ADD CONSTRAINT "cart_item_add_ons_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cart_item_add_ons"
  ADD CONSTRAINT "cart_item_add_ons_variationOptionId_fkey"
  FOREIGN KEY ("variationOptionId") REFERENCES "product_variation_options"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
