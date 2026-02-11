import { NextResponse } from "next/server";
import { getEnvInt, normalizeEnvValue } from "@/lib/env";
import { releaseExpiredEscrows } from "@/lib/escrow";
import { getRequestContext, reportServerError } from "@/lib/observability";
import {
  getEscrowReconcileStats,
  getLastEscrowReconcileRun,
  isReconcileStale,
  runTrackedEscrowReconcile,
} from "@/lib/system-jobs";

const RECONCILE_BATCH_SIZE = getEnvInt("ESCROW_RECONCILE_BATCH", 100);
const RECONCILE_MAX_DELAY_MINUTES = getEnvInt("ESCROW_RECONCILE_MAX_DELAY_MINUTES", 20);

function isAuthorized(req: Request) {
  const expectedSecret = normalizeEnvValue(process.env.INTERNAL_CRON_SECRET);
  if (!expectedSecret) return false;
  const fromHeader = req.headers.get("x-internal-cron-secret")?.trim() || "";
  const fromBearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  return fromHeader === expectedSecret || fromBearer === expectedSecret;
}

async function runReconcile(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { items, runId } = await runTrackedEscrowReconcile({
    batchSize: RECONCILE_BATCH_SIZE,
    source: "internal",
    executor: () => releaseExpiredEscrows(RECONCILE_BATCH_SIZE),
  });

  const [lastRun, stats24h] = await Promise.all([
    getLastEscrowReconcileRun(),
    getEscrowReconcileStats(24),
  ]);

  return NextResponse.json({
    ok: true,
    runId,
    processed: items.length,
    stale: isReconcileStale(lastRun?.startedAt ?? null, RECONCILE_MAX_DELAY_MINUTES),
    stats24h,
    lastRun,
    items: items.map((item) => ({
      listingId: item.listingId,
      refundedAmount: item.refundedAmount,
    })),
  });
}

export async function GET(req: Request) {
  const requestContext = getRequestContext(req, "/api/internal/escrow/reconcile");
  try {
    return await runReconcile(req);
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const requestContext = getRequestContext(req, "/api/internal/escrow/reconcile");
  try {
    return await runReconcile(req);
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
