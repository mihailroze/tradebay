import { normalizeEnvValue } from "@/lib/env";

export type ListingPricing = {
  baseRub: number;
  baseStars: number;
  feeStars: number;
  totalStars: number;
  feePercent: number;
  rubPerStar: number;
};

export function getRubPerStar(): number {
  const raw = normalizeEnvValue(process.env.RUB_PER_STAR);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1.82;
}

export function getFeePercent(): number {
  const raw = normalizeEnvValue(process.env.PLATFORM_FEE_PERCENT);
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 5;
}

export function rubToStars(rub: number, rubPerStar = getRubPerStar()): number {
  return Math.ceil(rub / rubPerStar);
}

export function getListingPricing(baseRub: number): ListingPricing {
  const rubPerStar = getRubPerStar();
  const feePercent = getFeePercent();
  const totalRub = baseRub * (1 + feePercent / 100);
  const baseStars = rubToStars(baseRub, rubPerStar);
  const totalStars = rubToStars(totalRub, rubPerStar);
  const feeStars = Math.max(totalStars - baseStars, 0);
  return { baseRub, baseStars, feeStars, totalStars, feePercent, rubPerStar };
}
