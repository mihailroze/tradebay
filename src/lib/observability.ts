import { sendOpsAlert } from "@/lib/alerts";
import { normalizeEnvValue } from "@/lib/env";

export type RequestContext = {
  requestId: string;
  route: string;
  method: string;
};

export function getRequestContext(req: Request, route: string): RequestContext {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  return {
    requestId,
    route,
    method: req.method,
  };
}

export function logInfo(message: string, context: RequestContext, extra?: Record<string, unknown>) {
  const payload = {
    level: "info",
    message,
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    ...extra,
  };
  console.info(JSON.stringify(payload));
}

export function logWarn(message: string, context: RequestContext, extra?: Record<string, unknown>) {
  const payload = {
    level: "warn",
    message,
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    ...extra,
  };
  console.warn(JSON.stringify(payload));
}

export function logError(message: string, context: RequestContext, extra?: Record<string, unknown>) {
  const payload = {
    level: "error",
    message,
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    ...extra,
  };
  console.error(JSON.stringify(payload));
}

async function captureSentry(error: unknown, context: RequestContext, extra?: Record<string, unknown>) {
  const dsn = normalizeEnvValue(process.env.SENTRY_DSN);
  if (!dsn) return;

  try {
    const sentry = await import("@sentry/nextjs");
    sentry.captureException(error, {
      tags: {
        route: context.route,
        method: context.method,
      },
      extra: {
        requestId: context.requestId,
        ...(extra || {}),
      },
    });
  } catch {
    // Sentry is optional in local/dev environments.
  }
}

export async function reportServerError(
  error: unknown,
  context: RequestContext,
  extra?: Record<string, unknown>,
) {
  const errorMessage = error instanceof Error ? error.message : "unknown_error";
  logError(errorMessage, context, extra);
  await captureSentry(error, context, extra);
  await sendOpsAlert(
    `HTTP 5xx on ${context.route}`,
    `requestId=${context.requestId}\nmethod=${context.method}\nerror=${errorMessage}`,
  );
}

