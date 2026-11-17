import crypto from "crypto";
import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { validateServerEnv } from "@/lib/env/server";
import { checkIntegrationStatus } from "@/lib/integrations/config";
import { isPlaceholderValue } from "@/lib/env/shared";
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limit";
import { NO_STORE_HEADERS, withHardTimeout } from "@/lib/security/http";

export const dynamic = "force-dynamic";

const HEALTH_DB_TIMEOUT_MS = 3000;

function isAuthorizedDiagnosticRequest(req?: Request): boolean {
  if (!req) return false;
  const expected = (
    process.env.HEALTH_CHECK_SECRET ||
    process.env.CRON_SECRET ||
    ""
  ).trim();
  if (!expected || isPlaceholderValue(expected) || expected.length < 16) {
    return false;
  }

  const authHeader = (req.headers.get("authorization") || "").trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const supplied = bearer || (req.headers.get("x-health-secret") || "").trim();
  if (!supplied) return false;

  const expectedBuf = Buffer.from(expected, "utf8");
  const suppliedBuf = Buffer.from(supplied, "utf8");
  if (expectedBuf.length !== suppliedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}

export async function GET(req?: Request) {
  const clientIp = req ? getClientIp(req) : "local-probe";
  const rl = await checkRateLimit(`health:${clientIp}`, "search");
  if (!rl.allowed) {
    return rateLimitExceededResponse(rl);
  }

  let probe: "live" | "ready" | "default" = "default";
  if (req) {
    try {
      const param = new URL(req.url).searchParams.get("probe");
      if (param === "live") probe = "live";
      else if (param === "ready") probe = "ready";
    } catch {
      probe = "default";
    }
  }

  const envValidation = validateServerEnv();
  const integrationStatus = checkIntegrationStatus();
  // HTTP requests in Next.js always supply `req`; redact sensitive environment/uptime telemetry
  // on unauthenticated HTTP calls in non-local environments while allowing internal 0-arg unit checks.
  const includeDiagnostics =
    !req ||
    integrationStatus.appEnv === "local" ||
    process.env.NODE_ENV === "test" ||
    isAuthorizedDiagnosticRequest(req);

  let dbStatus: "ok" | "error" | "skipped" = "skipped";
  let dbHealthy = true;

  if (probe !== "live") {
    try {
      const supabase = createPublicClient();
      const { error } = await withHardTimeout(
        async () => await supabase.from("books").select("id").limit(1),
        HEALTH_DB_TIMEOUT_MS,
        "Database health probe timed out."
      );
      if (error) {
        dbStatus = "error";
        dbHealthy = false;
      } else {
        dbStatus = "ok";
      }
    } catch {
      dbStatus = "error";
      dbHealthy = false;
    }
  }

  const overallHealthy = probe === "live" ? true : dbHealthy && envValidation.valid;
  // Explicit ?probe=ready fails closed with 503 if DB readiness or env validation fails;
  // default liveness/compat mode preserves 200 status for local offline checks.
  const statusCode = probe === "ready" && !overallHealthy ? 503 : 200;

  const basePayload: Record<string, any> = {
    status: probe === "live" || overallHealthy ? "healthy" : "degraded",
    probe: probe === "default" ? "standard" : probe,
    timestamp: new Date().toISOString(),
    checks: {
      app: "ok",
      database: dbStatus,
      environmentValid: envValidation.valid,
    },
  };

  if (includeDiagnostics) {
    basePayload.uptimeSeconds = Math.round(process.uptime());
    basePayload.environment = {
      valid: envValidation.valid,
      appEnv: integrationStatus.appEnv,
      mockServicesAllowed: integrationStatus.allowMockServices,
      configuredServices: {
        supabase: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ),
        razorpay: integrationStatus.razorpay.enabled && integrationStatus.razorpay.configured,
        resend: integrationStatus.resend.enabled && integrationStatus.resend.configured,
        cloudinary: integrationStatus.cloudinary.enabled && integrationStatus.cloudinary.configured,
        delhivery: integrationStatus.delhivery.enabled && integrationStatus.delhivery.configured,
      },
      serviceModes: {
        razorpay: integrationStatus.razorpay.mode,
        resend: integrationStatus.resend.mode,
        cloudinary: integrationStatus.cloudinary.mode,
        delhivery: integrationStatus.delhivery.mode,
      },
      issueCount: envValidation.errors.length,
    };
  }

  return NextResponse.json(basePayload, {
    status: statusCode,
    headers: {
      ...NO_STORE_HEADERS,
      ...createRateLimitHeaders(rl),
    },
  });
}
