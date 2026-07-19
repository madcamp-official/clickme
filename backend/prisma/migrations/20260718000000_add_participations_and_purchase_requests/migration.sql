-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InquiryCategory" AS ENUM ('SERVICE', 'ACCOUNT', 'MODERATION', 'PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('PENDING', 'RESOLVED');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "availableUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pickupStore" TEXT NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "accepterId" TEXT,
    "city" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "menu" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "desiredTime" TEXT NOT NULL,
    "note" TEXT,
    "openChatUrl" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "InquiryCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Participation_userId_postId_key" ON "Participation"("userId", "postId");
CREATE INDEX "Participation_postId_status_idx" ON "Participation"("postId", "status");
CREATE INDEX "Participation_userId_createdAt_idx" ON "Participation"("userId", "createdAt");
CREATE INDEX "PurchaseRequest_status_createdAt_idx" ON "PurchaseRequest"("status", "createdAt");
CREATE INDEX "PurchaseRequest_requesterId_createdAt_idx" ON "PurchaseRequest"("requesterId", "createdAt");
CREATE INDEX "PurchaseRequest_accepterId_createdAt_idx" ON "PurchaseRequest"("accepterId", "createdAt");
CREATE INDEX "Inquiry_userId_createdAt_idx" ON "Inquiry"("userId", "createdAt");
CREATE INDEX "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_accepterId_fkey" FOREIGN KEY ("accepterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
