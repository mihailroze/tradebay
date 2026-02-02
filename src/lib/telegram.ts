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

function buildDataCheckString(params: URLSearchParams, includeSignature: boolean): string {
  const entries: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    if (!includeSignature && key === "signature") return;
    entries.push(`${key}=${value}`);
  });
  return entries.sort().join("\n");
}

export function verifyTelegramInitData(initData: string, botToken: string): TelegramInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const dataCheckString = buildDataCheckString(params, false);
  const calculatedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (calculatedHash !== hash) {
    const dataCheckStringWithSig = buildDataCheckString(params, true);
    const calculatedWithSig = crypto.createHmac("sha256", secret).update(dataCheckStringWithSig).digest("hex");
    if (calculatedWithSig !== hash) return null;
  }

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
