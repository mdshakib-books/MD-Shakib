import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const OTP_SECRET = process.env.DELIVERY_OTP_HMAC_SECRET || "md_shakib_delivery_otp_secure_hmac_secret_2026";

/**
 * Computes the HMAC-SHA256 hash of a delivery OTP with server-only secret.
 */
export function hashDeliveryOtp(otp: string): string {
  return crypto.createHmac("sha256", OTP_SECRET).update(otp.trim()).digest("hex");
}

/**
 * Generates a cryptographically random 6-digit OTP for an order.
 * Stores only the HMAC-SHA256 hash in the database.
 */
export async function generateAndStoreDeliveryOtp(
  orderId: string,
  expiresInMinutes: number = 24 * 60
): Promise<{ success: boolean; plaintextOtp?: string; expiresAt?: string; error?: string }> {
  const adminDb = createAdminClient();

  // Validate order status
  const { data: order, error: orderErr } = await adminDb
    .from("orders")
    .select("id, order_status, user_id")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return { success: false, error: `Order ${orderId} not found.` };
  }

  // Generate 6-digit OTP using CSPRNG
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const otpHmac = hashDeliveryOtp(rawOtp);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  // Atomically invalidate old OTP and insert new active hash via RPC
  const { data, error: rpcErr } = await adminDb.rpc("regenerate_delivery_otp_atomic", {
    p_order_id: orderId,
    p_new_hash: otpHmac,
    p_expires_at: expiresAt,
  });

  if (rpcErr || !(data as any)?.success) {
    return { success: false, error: (data as any)?.error || rpcErr?.message || "Failed to store OTP." };
  }

  return {
    success: true,
    plaintextOtp: rawOtp,
    expiresAt,
  };
}

/**
 * Authoritatively verifies delivery OTP via PostgreSQL atomic stored procedure.
 */
export async function verifyDeliveryOtp(params: {
  orderId: string;
  candidateOtp: string;
  actorId: string;
  actorRole: string;
  awb?: string;
}): Promise<{
  success: boolean;
  orderId?: string;
  status?: string;
  outcome?: string;
  attemptsLeft?: number;
  error?: string;
}> {
  const { orderId, candidateOtp, actorId, actorRole, awb } = params;
  const cleanOtp = (candidateOtp || "").trim();

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return {
      success: false,
      error: "Delivery OTP must be exactly 6 digits.",
      outcome: "FAILED_INVALID_OTP",
    };
  }

  const candidateHash = hashDeliveryOtp(cleanOtp);
  const adminDb = createAdminClient();

  const { data, error } = await adminDb.rpc("verify_delivery_otp_atomic", {
    p_order_id: orderId,
    p_candidate_hash: candidateHash,
    p_actor_id: actorId,
    p_actor_role: actorRole,
    p_awb: awb || undefined,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const res = data as any;
  return {
    success: res.success ?? false,
    orderId: res.order_id,
    status: res.status,
    outcome: res.outcome,
    attemptsLeft: res.attempts_left,
    error: res.error,
  };
}

/**
 * Securely retrieves or reveals the active OTP for the authenticated order owner.
 * Revealed ONLY when order status is 'Out for Delivery'.
 */
export async function getCustomerOrderDeliveryOtp(
  orderId: string,
  userId: string
): Promise<{
  eligible: boolean;
  status: string;
  otp?: string;
  expiresAt?: string;
  message?: string;
}> {
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, user_id, order_status, shipping_awb")
    .eq("id", orderId)
    .single();

  if (error || !order || order.user_id !== userId) {
    return {
      eligible: false,
      status: "unauthorized",
      message: "Order not found or unauthorized.",
    };
  }

  if (order.order_status !== "Out for Delivery") {
    return {
      eligible: false,
      status: order.order_status,
      message: `Delivery OTP is generated and revealed only when shipment is Out for Delivery (current: ${order.order_status}).`,
    };
  }

  // Check if an active OTP exists
  const { data: activeOtp } = await adminDb
    .from("delivery_otps")
    .select("id, status, expires_at")
    .eq("order_id", orderId)
    .eq("status", "active")
    .maybeSingle();

  if (!activeOtp || new Date(activeOtp.expires_at).getTime() < Date.now()) {
    // Generate new active OTP
    const gen = await generateAndStoreDeliveryOtp(orderId);
    if (!gen.success || !gen.plaintextOtp) {
      return {
        eligible: false,
        status: "error",
        message: "Failed to generate delivery OTP.",
      };
    }
    return {
      eligible: true,
      status: "active",
      otp: gen.plaintextOtp,
      expiresAt: gen.expiresAt,
    };
  }

  // Note: Since DB stores only HMAC hash, if active OTP already exists but we need to display it to the owner,
  // we regenerate a fresh OTP for the customer session to ensure zero plaintext storage in the DB while maintaining freshness.
  const gen = await generateAndStoreDeliveryOtp(orderId);
  return {
    eligible: true,
    status: "active",
    otp: gen.plaintextOtp,
    expiresAt: gen.expiresAt,
  };
}
