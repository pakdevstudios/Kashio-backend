-- Customer saved addresses for web checkout/profile and mobile clients.
CREATE TABLE "addresses" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "addressLine" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "stateProvince" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "deliveryInstructions" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");
CREATE INDEX "addresses_userId_isDefault_idx" ON "addresses"("userId", "isDefault");

ALTER TABLE "addresses"
  ADD CONSTRAINT "addresses_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
