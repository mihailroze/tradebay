import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser, isAdminTelegramId } from "@/lib/auth";

export type AdminUser = {
  id: string;
  telegramId: string;
  username: string | null;
  displayName: string | null;
};

export async function requireAdminUser(): Promise<AdminUser | null> {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser || !isAdminTelegramId(tgUser.id)) return null;

  return prisma.user.upsert({
    where: { telegramId: String(tgUser.id) },
    update: {
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
    create: {
      telegramId: String(tgUser.id),
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      telegramId: true,
      username: true,
      displayName: true,
    },
  });
}
