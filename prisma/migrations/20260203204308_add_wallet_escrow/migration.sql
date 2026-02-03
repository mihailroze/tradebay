-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'RESERVED';

-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'FEE';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "feeAmount" INTEGER,
ADD COLUMN     "holdAmount" INTEGER,
ADD COLUMN     "reservedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "lockedBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Listing_buyerId_status_idx" ON "Listing"("buyerId", "status");
