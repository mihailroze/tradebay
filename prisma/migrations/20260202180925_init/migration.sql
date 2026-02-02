-- CreateTable
CREATE TABLE "ListingFavorite" (
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingFavorite_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateIndex
CREATE INDEX "ListingFavorite_listingId_idx" ON "ListingFavorite"("listingId");

-- AddForeignKey
ALTER TABLE "ListingFavorite" ADD CONSTRAINT "ListingFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFavorite" ADD CONSTRAINT "ListingFavorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
