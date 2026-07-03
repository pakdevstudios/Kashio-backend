ALTER TABLE "products"
  ALTER COLUMN "productType" SET DEFAULT 'VARIABLE';

UPDATE "products"
SET "productType" = 'VARIABLE';

INSERT INTO "product_variation_options" (
  "id",
  "productId",
  "name",
  "sku",
  "price",
  "salePrice",
  "stockQuantity",
  "isActive",
  "isDefault",
  "minQuantity",
  "maxQuantity",
  "displayOrder",
  "imageUrl",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  p."id",
  'Default',
  NULL,
  p."price",
  p."discountedPrice",
  p."stockQuantity",
  p."isActive",
  true,
  1,
  99,
  0,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "products" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "product_variation_options" v
  WHERE v."productId" = p."id"
);
