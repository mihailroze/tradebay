type Bucket = {
  count: number;
  resetAt: number;
};

type DailyBucket = {
  count: number;
  sum: number;
  dayKey: string;
};

const buckets = new Map<string, Bucket>();
const dailyBuckets = new Map<string, DailyBucket>();

function now() {
  return Date.now();
}

function getUtcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function checkRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const { key, limit, windowMs } = options;
  const current = now();
  const bucket = buckets.get(key);
  if (!bucket || current > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, bucket.resetAt - current),
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterMs: 0 };
}

export function checkDailyLimit(options: {
  key: string;
  maxCount: number;
  maxSum: number;
  nextAmount: number;
}) {
  const { key, maxCount, maxSum, nextAmount } = options;
  const dayKey = getUtcDayKey();
  const bucket = dailyBuckets.get(key);
  const normalized: DailyBucket =
    bucket && bucket.dayKey === dayKey
      ? bucket
      : {
          dayKey,
          count: 0,
          sum: 0,
        };

  if (normalized.count + 1 > maxCount) {
    return { allowed: false, reason: "daily_count_limit" as const };
  }
  if (normalized.sum + nextAmount > maxSum) {
    return { allowed: false, reason: "daily_amount_limit" as const };
  }

  normalized.count += 1;
  normalized.sum += nextAmount;
  dailyBuckets.set(key, normalized);
  return { allowed: true as const };
}

