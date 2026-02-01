import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData, isAdminTelegramId } from "@/lib/auth";

const schema = z.object({
  status: z.enum(["ACTIVE", "SOLD", "HIDDEN"]),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const initData = getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { seller: true },
  });

  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = listing.seller.telegramId === String(tgUser.id);
  const isAdmin = isAdminTelegramId(tgUser.id);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: { status: parsed.data.status },
  });

  if (parsed.data.status !== "ACTIVE") {
    await prisma.image.deleteMany({ where: { listingId: listing.id } });
  }

  return NextResponse.json({ listing: updated });
}
