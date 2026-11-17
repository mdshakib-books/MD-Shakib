import { createAdminClient } from "@/lib/supabase/admin";

export interface ReleaseExpiredReservationsResult {
  success: boolean;
  releasedCount: number;
  orderIds: string[];
  error?: string;
}

/**
 * Trusted server-only worker that atomically releases expired unpaid ONLINE inventory reservations,
 * restores book stock, releases reserved coupons, and marks abandoned pending orders as Cancelled.
 *
 * Uses createAdminClient() (service_role) because release_expired_reservations_atomic is strictly
 * revoked from anon and authenticated roles.
 */
export async function runReleaseExpiredReservationsWorker(
  limit: number = 50,
  deps: { adminDb?: any } = {}
): Promise<ReleaseExpiredReservationsResult> {
  if (typeof window !== "undefined") {
    throw new Error("Security violation: runReleaseExpiredReservationsWorker cannot execute in browser context.");
  }

  const boundedLimit =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.floor(limit)))
      : 50;

  const adminDb = deps.adminDb || createAdminClient();
  const { data, error } = await adminDb.rpc("release_expired_reservations_atomic", {
    p_limit: boundedLimit,
  });

  if (error) {
    console.error("Failed to release expired reservations:", error.message);
    return {
      success: false,
      releasedCount: 0,
      orderIds: [],
      error: error.message,
    };
  }

  const res = (data || {}) as any;
  return {
    success: true,
    releasedCount: Number(res.released_orders_count || 0),
    orderIds: Array.isArray(res.order_ids) ? res.order_ids : [],
  };
}
