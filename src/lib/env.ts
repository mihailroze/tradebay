export function normalizeEnvValue(value?: string): string {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}
