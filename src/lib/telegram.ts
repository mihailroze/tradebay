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

export type TelegramLoginData = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date?: number;
  hash: string;
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

export function verifyTelegramLoginData(payload: Record<string, unknown>, botToken: string): TelegramLoginData | null {
  if (!payload || !botToken) return null;
  const hash = typeof payload.hash === "string" ? payload.hash : "";
  if (!hash) return null;

  const data: Record<string, string> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (key === "hash" || value === undefined || value === null) return;
    data[key] = String(value);
  });

  const dataCheckString = Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join("\n");
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (calculated !== hash) return null;

  const idRaw = typeof payload.id === "string" ? Number(payload.id) : Number(payload.id);
  if (!Number.isFinite(idRaw)) return null;

  return {
    id: idRaw,
    username: typeof payload.username === "string" ? payload.username : undefined,
    first_name: typeof payload.first_name === "string" ? payload.first_name : undefined,
    last_name: typeof payload.last_name === "string" ? payload.last_name : undefined,
    photo_url: typeof payload.photo_url === "string" ? payload.photo_url : undefined,
    auth_date: payload.auth_date ? Number(payload.auth_date) : undefined,
    hash,
  };
}
