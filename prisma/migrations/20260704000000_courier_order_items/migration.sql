CREATE TABLE "courier_order_items" (
  "id" TEXT NOT NULL,
  "courierId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variationOptionId" TEXT,
  "productName" TEXT NOT NULL,
  "selectedVariant" TEXT,
  "price" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "courier_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "courier_order_items_courierId_idx" ON "courier_order_items"("courierId");
CREATE INDEX "courier_order_items_productId_idx" ON "courier_order_items"("productId");
CREATE INDEX "courier_order_items_variationOptionId_idx" ON "courier_order_items"("variationOptionId");

ALTER TABLE "courier_order_items"
  ADD CONSTRAINT "courier_order_items_courierId_fkey"
  FOREIGN KEY ("courierId") REFERENCES "couriers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "courier_order_items"
  ADD CONSTRAINT "courier_order_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "courier_order_items"
  ADD CONSTRAINT "courier_order_items_variationOptionId_fkey"
  FOREIGN KEY ("variationOptionId") REFERENCES "product_variation_options"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
