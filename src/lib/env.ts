export function normalizeEnvValue(value?: string): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function getEnvInt(name: string, fallback: number): number {
  const raw = normalizeEnvValue(process.env[name]);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback;
  return value;
}

export function getEnvFloat(name: string, fallback: number): number {
  const raw = normalizeEnvValue(process.env[name]);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

export function getEnvBool(name: string, fallback = false): boolean {
  const raw = normalizeEnvValue(process.env[name]).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}
