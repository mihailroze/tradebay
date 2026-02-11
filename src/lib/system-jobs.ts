import { JobRunStatus, Prisma, SystemJobName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOpsAlert } from "@/lib/alerts";

export async function startSystemJob(jobName: SystemJobName) {
  return prisma.systemJobRun.create({
    data: {
      jobName,
      status: "RUNNING",
    },
  });
}

export async function finishSystemJob(params: {
  runId: string;
  status: JobRunStatus;
  processed?: number;
  details?: string;
}) {
  return prisma.systemJobRun.update({
    where: { id: params.runId },
    data: {
      status: params.status,
      processed: params.processed ?? 0,
      details: params.details ?? null,
      finishedAt: new Date(),
    },
  });
}

export async function runTrackedEscrowReconcile(params: {
  batchSize: number;
  executor: () => Promise<Array<{ listingId: string; refundedAmount: number }>>;
  source: "internal" | "admin";
}) {
  const run = await startSystemJob(SystemJobName.ESCROW_RECONCILE);
  try {
    const items = await params.executor();
    await finishSystemJob({
      runId: run.id,
      status: JobRunStatus.SUCCESS,
      processed: items.length,
      details: JSON.stringify({ source: params.source }),
    });
    return { runId: run.id, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await finishSystemJob({
      runId: run.id,
      status: JobRunStatus.FAILED,
      processed: 0,
      details: JSON.stringify({ source: params.source, error: message }),
    });
    await sendOpsAlert(
      "Escrow reconcile failed",
      `runId=${run.id}\nsource=${params.source}\nbatchSize=${params.batchSize}\nerror=${message}`,
    );
    throw error;
  }
}

export async function getLastEscrowReconcileRun() {
  return prisma.systemJobRun.findFirst({
    where: { jobName: SystemJobName.ESCROW_RECONCILE },
    orderBy: { startedAt: "desc" },
  });
}

export async function getRecentEscrowReconcileRuns(limit = 20) {
  return prisma.systemJobRun.findMany({
    where: { jobName: SystemJobName.ESCROW_RECONCILE },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getEscrowReconcileStats(hours = 24) {
  const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await prisma.systemJobRun.groupBy({
    by: ["status"],
    where: {
      jobName: SystemJobName.ESCROW_RECONCILE,
      startedAt: { gte: windowStart },
    },
    _count: { _all: true },
    _sum: { processed: true },
  });

  return rows.reduce(
    (acc, row) => {
      acc.runs += row._count._all;
      acc.processed += row._sum.processed ?? 0;
      if (row.status === JobRunStatus.FAILED) acc.failedRuns += row._count._all;
      if (row.status === JobRunStatus.SUCCESS) acc.successRuns += row._count._all;
      return acc;
    },
    { runs: 0, successRuns: 0, failedRuns: 0, processed: 0 },
  );
}

export function isReconcileStale(lastRunAt: Date | null, maxDelayMinutes: number) {
  if (!lastRunAt) return true;
  return Date.now() - lastRunAt.getTime() > maxDelayMinutes * 60 * 1000;
}

export async function getFinanceSummary(days: number) {
  const clampedDays = Math.max(1, Math.min(90, days));
  const since = new Date(Date.now() - clampedDays * 24 * 60 * 60 * 1000);

  const [
    txRows,
    walletAgg,
    totalTopupAgg,
    pendingPurchaseAgg,
    soldCountAgg,
    activeDisputeCount,
  ] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        day: Date;
        type: string;
        status: string;
        amount: bigint | number | null;
        count: bigint | number;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc('day', "createdAt") AS day,
        "type"::text AS type,
        "status"::text AS status,
        COALESCE(SUM("amount"), 0) AS amount,
        COUNT(*) AS count
      FROM "WalletTransaction"
      WHERE "createdAt" >= ${since}
      GROUP BY 1,2,3
      ORDER BY 1 DESC, 2 ASC, 3 ASC
    `),
    prisma.wallet.aggregate({
      _sum: { balance: true, lockedBalance: true },
      _count: { _all: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "TOP_UP", status: "COMPLETED" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "PURCHASE", status: "PENDING" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.listing.count({ where: { status: "SOLD" } }),
    prisma.disputeCase.count({
      where: { status: { in: ["OPEN", "IN_REVIEW"] } },
    }),
  ]);

  const totalBalance = Number(walletAgg._sum.balance ?? 0);
  const totalLocked = Number(walletAgg._sum.lockedBalance ?? 0);
  const expectedSupply = Number(totalTopupAgg._sum.amount ?? 0);
  const actualSupply = totalBalance + totalLocked;
  const supplyDiff = actualSupply - expectedSupply;

  const byDay = txRows.map((row) => ({
    day: row.day.toISOString().slice(0, 10),
    type: row.type,
    status: row.status,
    amount: Number(row.amount ?? 0),
    count: Number(row.count ?? 0),
  }));

  return {
    periodDays: clampedDays,
    generatedAt: new Date().toISOString(),
    totals: {
      wallets: walletAgg._count._all,
      totalBalance,
      totalLocked,
      expectedSupplyFromTopups: expectedSupply,
      actualSupply,
      supplyDiff,
      soldListings: soldCountAgg,
      openDisputes: activeDisputeCount,
      pendingPurchaseHold: Math.abs(Number(pendingPurchaseAgg._sum.amount ?? 0)),
      pendingPurchaseOps: Number(pendingPurchaseAgg._count._all ?? 0),
      completedTopupOps: Number(totalTopupAgg._count._all ?? 0),
    },
    byDay,
  };
}
