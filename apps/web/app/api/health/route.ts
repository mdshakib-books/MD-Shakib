import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "unknown";
  let dbLatencyMs = 0;

  try {
    const supabase = createPublicClient();
    const dbStart = Date.now();
    const { error } = await supabase.from("books").select("id").limit(1);
    dbLatencyMs = Date.now() - dbStart;

    if (error) {
      dbStatus = "degraded";
    } else {
      dbStatus = "connected";
    }
  } catch {
    dbStatus = "unreachable";
  }

  const isHealthy = dbStatus !== "unreachable";
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      totalLatencyMs: Date.now() - startTime,
      services: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        configuredServices: {
          supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          razorpay: Boolean(process.env.RAZORPAY_KEY_SECRET || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID),
          delhivery: Boolean(process.env.DELHIVERY_TOKEN),
          resend: Boolean(process.env.RESEND_API_KEY),
          cloudinary: Boolean(process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME),
        },
      },
    },
    {
      status: statusCode,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json",
      },
    }
  );
}

