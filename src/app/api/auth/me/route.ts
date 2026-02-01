import { NextResponse } from "next/server";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData, isAdminTelegramId } from "@/lib/auth";

export async function GET() {
  const initData = await getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);

  if (!tgUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: tgUser.id,
      username: tgUser.username ?? null,
      firstName: tgUser.first_name ?? null,
      lastName: tgUser.last_name ?? null,
    },
    isAdmin: isAdminTelegramId(tgUser.id),
  });
}
