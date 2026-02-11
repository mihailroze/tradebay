import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import { getRequestContext, reportServerError } from "@/lib/observability";
import { getFinanceSummary } from "@/lib/system-jobs";

export async function GET(req: Request) {
  const requestContext = getRequestContext(req, "/api/admin/finance/summary");

  try {
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const daysRaw = Number(searchParams.get("days") || 30);
    const days = Number.isFinite(daysRaw) ? daysRaw : 30;

    const summary = await getFinanceSummary(days);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to build finance summary", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
