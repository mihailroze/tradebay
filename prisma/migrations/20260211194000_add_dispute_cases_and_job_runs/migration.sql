-- CreateEnum
CREATE TYPE "DisputeCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED_RELEASED', 'RESOLVED_REFUNDED');

-- CreateEnum
CREATE TYPE "DisputeEventType" AS ENUM ('OPENED', 'NOTE', 'MARK_IN_REVIEW', 'RESOLVED_RELEASE', 'RESOLVED_REFUND');

-- CreateEnum
CREATE TYPE "SystemJobName" AS ENUM ('ESCROW_RECONCILE');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "DisputeCase" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "status" "DisputeCaseStatus" NOT NULL DEFAULT 'OPEN',
  "openedById" TEXT NOT NULL,
  "assignedAdminId" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "slaDeadlineAt" TIMESTAMP(3),
  "resolutionTemplate" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DisputeCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeCaseEvent" (
  "id" TEXT NOT NULL,
  "disputeCaseId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "DisputeEventType" NOT NULL,
  "note" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DisputeCaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemJobRun" (
  "id" TEXT NOT NULL,
  "jobName" "SystemJobName" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
  "processed" INTEGER NOT NULL DEFAULT 0,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SystemJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisputeCase_listingId_key" ON "DisputeCase"("listingId");

-- CreateIndex
CREATE INDEX "DisputeCase_status_openedAt_idx" ON "DisputeCase"("status", "openedAt");

-- CreateIndex
CREATE INDEX "DisputeCase_slaDeadlineAt_status_idx" ON "DisputeCase"("slaDeadlineAt", "status");

-- CreateIndex
CREATE INDEX "DisputeCaseEvent_disputeCaseId_createdAt_idx" ON "DisputeCaseEvent"("disputeCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemJobRun_jobName_startedAt_idx" ON "SystemJobRun"("jobName", "startedAt");

-- AddForeignKey
ALTER TABLE "DisputeCase"
ADD CONSTRAINT "DisputeCase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeCase"
ADD CONSTRAINT "DisputeCase_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeCase"
ADD CONSTRAINT "DisputeCase_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeCaseEvent"
ADD CONSTRAINT "DisputeCaseEvent_disputeCaseId_fkey" FOREIGN KEY ("disputeCaseId") REFERENCES "DisputeCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeCaseEvent"
ADD CONSTRAINT "DisputeCaseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
