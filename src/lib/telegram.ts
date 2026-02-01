import crypto from "crypto";

export type TelegramWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramInitData = {
  auth_date: number;
  user?: TelegramWebAppUser;
  [key: string]: string | number | TelegramWebAppUser | undefined;
};

function buildDataCheckString(params: URLSearchParams): string {
  const entries: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    entries.push(`${key}=${value}`);
  });
  return entries.sort().join("\n");
}

export function verifyTelegramInitData(initData: string, botToken: string): TelegramInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const dataCheckString = buildDataCheckString(params);
  const secret = crypto.createHmac("sha256", botToken).update("WebAppData").digest();
  const calculatedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (calculatedHash !== hash) return null;

  const result: TelegramInitData = { auth_date: 0 };
  params.forEach((value, key) => {
    if (key === "hash") return;
    if (key === "auth_date") {
      result.auth_date = Number(value);
      return;
    }
    if (key === "user") {
      try {
        result.user = JSON.parse(value) as TelegramWebAppUser;
      } catch {
        result.user = undefined;
      }
      return;
    }
    result[key] = value;
  });

  return result;
}
