import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnvInt } from "@/lib/env";
import { releaseExpiredEscrows } from "@/lib/escrow";
import { requireAdminUser } from "@/lib/admin";
import { getRequestContext, reportServerError } from "@/lib/observability";
import {
  getEscrowReconcileStats,
  getLastEscrowReconcileRun,
  getRecentEscrowReconcileRuns,
  isReconcileStale,
  runTrackedEscrowReconcile,
} from "@/lib/system-jobs";

const DEFAULT_BATCH_SIZE = getEnvInt("ESCROW_RECONCILE_BATCH", 100);
const MAX_DELAY_MINUTES = getEnvInt("ESCROW_RECONCILE_MAX_DELAY_MINUTES", 20);

const runSchema = z.object({
  batchSize: z.number().int().min(1).max(500).optional(),
});

export async function GET(req: Request) {
  const requestContext = getRequestContext(req, "/api/admin/ops/reconcile");

  try {
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [lastRun, recentRuns, stats24h] = await Promise.all([
      getLastEscrowReconcileRun(),
      getRecentEscrowReconcileRuns(20),
      getEscrowReconcileStats(24),
    ]);

    return NextResponse.json({
      ok: true,
      stale: isReconcileStale(lastRun?.startedAt ?? null, MAX_DELAY_MINUTES),
      maxDelayMinutes: MAX_DELAY_MINUTES,
      lastRun,
      recentRuns,
      stats24h,
    });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to load reconcile status", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const requestContext = getRequestContext(req, "/api/admin/ops/reconcile");

  try {
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = runSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const batchSize = parsed.data.batchSize ?? DEFAULT_BATCH_SIZE;
    const { runId, items } = await runTrackedEscrowReconcile({
      batchSize,
      source: "admin",
      executor: () => releaseExpiredEscrows(batchSize),
    });

    const [lastRun, stats24h] = await Promise.all([
      getLastEscrowReconcileRun(),
      getEscrowReconcileStats(24),
    ]);

    return NextResponse.json({
      ok: true,
      runId,
      processed: items.length,
      stale: isReconcileStale(lastRun?.startedAt ?? null, MAX_DELAY_MINUTES),
      stats24h,
      lastRun,
      items: items.map((item) => ({
        listingId: item.listingId,
        refundedAmount: item.refundedAmount,
      })),
    });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to run reconcile", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
