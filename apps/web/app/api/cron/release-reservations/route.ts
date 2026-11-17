import crypto from "crypto";
import { NextResponse } from "next/server";
import { isPlaceholderValue } from "@/lib/env/shared";
import { runReleaseExpiredReservationsWorker } from "@/lib/commerce/reservations";

function verifyCronAuthorization(req: Request): {
  authorized: boolean;
  configured: boolean;
  status: number;
  error?: string;
} {
  const expectedSecret = (process.env.CRON_SECRET || "").trim();
  if (!expectedSecret || isPlaceholderValue(expectedSecret) || expectedSecret.length < 16) {
    return {
      authorized: false,
      configured: false,
      status: 503,
      error: "Reservation cleanup cron secret (CRON_SECRET) is not configured on the server.",
    };
  }

  const authHeader = (req.headers.get("authorization") || "").trim();
  const cronHeader = (req.headers.get("x-cron-secret") || "").trim();
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const suppliedSecret = bearerToken || cronHeader;

  if (!suppliedSecret) {
    return {
      authorized: false,
      configured: true,
      status: 401,
      error: "Unauthorized: Missing cron authorization credentials.",
    };
  }

  const expectedBuf = Buffer.from(expectedSecret, "utf8");
  const suppliedBuf = Buffer.from(suppliedSecret, "utf8");

  if (expectedBuf.length !== suppliedBuf.length) {
    return {
      authorized: false,
      configured: true,
      status: 401,
      error: "Unauthorized: Invalid cron authorization credentials.",
    };
  }

  if (!crypto.timingSafeEqual(expectedBuf, suppliedBuf)) {
    return {
      authorized: false,
      configured: true,
      status: 401,
      error: "Unauthorized: Invalid cron authorization credentials.",
    };
  }

  return { authorized: true, configured: true, status: 200 };
}

async function handleCronRequest(req: Request) {
  const auth = verifyCronAuthorization(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, configured: auth.configured, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  let limit = 50;
  try {
    const url = new URL(req.url);
    const queryLimit = url.searchParams.get("limit");
    if (queryLimit !== null) {
      const parsed = Number(queryLimit);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(500, Math.floor(parsed));
      }
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0) {
        limit = Math.min(500, Math.floor(body.limit));
      }
    }
  } catch {
    // Keep safe default limit of 50
  }

  const result = await runReleaseExpiredReservationsWorker(limit);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error || "Reservation cleanup failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      success: true,
      releasedCount: result.releasedCount,
      orderIds: result.orderIds,
      executedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(req: Request) {
  return handleCronRequest(req);
}

export async function POST(req: Request) {
  return handleCronRequest(req);
}
