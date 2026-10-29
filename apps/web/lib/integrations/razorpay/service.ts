import crypto from "crypto";
import { getRazorpayClient } from "./client";
import { getIntegrationsConfig } from "../config";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "../resend/service";

export interface CreatePaymentOrderResult {
  razorpayOrderId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
  orderId: string;
}

export interface VerifySignatureParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  userId?: string;
}

/**
 * Creates a Razorpay payment order for an existing pending application order.
 * Strictly derives the payment amount from the database record to prevent client tampering.
 */
export async function createRazorpayOrder(
  orderId: string,
  userId: string
): Promise<CreatePaymentOrderResult> {
  const adminDb = createAdminClient();
  const { razorpay } = getIntegrationsConfig();

  // 1. Fetch authoritative order from database
  const { data: order, error: orderError } = await adminDb
    .from("orders")
    .select("id, user_id, total_amount, payment_status, payment_method, razorpay_order_id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Validate ownership & state
  if (order.user_id !== userId) {
    throw new Error("Unauthorized: Order does not belong to the authenticated user.");
  }

  if (order.payment_status === "Paid") {
    throw new Error("Order is already paid.");
  }

  // If a Razorpay order was already generated, return the existing provider order
  if (order.razorpay_order_id) {
    const amountInPaise = Math.round(Number(order.total_amount) * 100);
    return {
      razorpayOrderId: order.razorpay_order_id,
      amount: amountInPaise,
      currency: "INR",
      keyId: razorpay.keyId,
      orderId: order.id,
    };
  }

  const amountInPaise = Math.round(Number(order.total_amount) * 100);

  // 3. Create Razorpay order via SDK
  let rzpOrderId: string;
  try {
    const client = getRazorpayClient();
    const rzpOrder = await client.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order.id,
      notes: {
        application_order_id: order.id,
        user_id: userId,
      },
    });
    rzpOrderId = rzpOrder.id;
  } catch (error: any) {
    // If running in offline test or mock environment without live API keys
    if (razorpay.keyId.startsWith("rzp_test_mock")) {
      rzpOrderId = `order_mock_${Date.now()}`;
    } else {
      throw new Error(`Razorpay order creation failed: ${error?.message || error}`);
    }
  }

  // 4. Record payment intention in public.payments table
  const { error: paymentError } = await adminDb.from("payments").insert({
    order_id: order.id,
    user_id: userId,
    payment_id: rzpOrderId,
    provider_order_id: rzpOrderId,
    amount: order.total_amount,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  if (paymentError) {
    console.error("Failed to insert payment record:", paymentError);
  }

  // 5. Update order with razorpay_order_id
  await adminDb
    .from("orders")
    .update({ razorpay_order_id: rzpOrderId })
    .eq("id", order.id);

  return {
    razorpayOrderId: rzpOrderId,
    amount: amountInPaise,
    currency: "INR",
    keyId: razorpay.keyId,
    orderId: order.id,
  };
}

/**
 * Validates the cryptographic HMAC SHA-256 signature from Razorpay.
 */
export function validateRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  secret: string
): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !secret) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(razorpaySignature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay payment signature and transitions order and payment records to 'Paid'.
 * Fully idempotent to prevent duplicate stock or status mutations.
 */
export async function verifyAndSettlePayment(params: VerifySignatureParams) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = params;
  const { razorpay } = getIntegrationsConfig();

  // 1. Verify signature
  const isValid = validateRazorpaySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    razorpay.keySecret
  );

  if (!isValid) {
    throw new Error("Invalid Razorpay payment signature.");
  }

  const adminDb = createAdminClient();

  // 2. Fetch the corresponding order
  const { data: order, error: orderError } = await adminDb
    .from("orders")
    .select("id, user_id, payment_status, total_amount, address_snapshot, is_paid")
    .eq("razorpay_order_id", razorpay_order_id)
    .single();

  if (orderError || !order) {
    throw new Error(`Order associated with Razorpay Order ID ${razorpay_order_id} not found.`);
  }

  if (userId && order.user_id !== userId) {
    throw new Error("Unauthorized: Order does not belong to the authenticated user.");
  }

  // 3. Call atomic database settlement procedure (pessimistic lock FOR UPDATE)
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: razorpay_order_id,
    p_razorpay_payment_id: razorpay_payment_id,
    p_signature: razorpay_signature,
    p_raw_response: { method: "browser_signature_verification" },
  });

  if (rpcErr) {
    throw new Error(`Atomic settlement failed: ${rpcErr.message}`);
  }

  const result = rpcRes as any;
  if (!result?.success) {
    throw new Error(result?.message || "Failed to settle payment");
  }

  // 4. Trigger transactional email ONLY if this transaction performed the initial settlement
  if (result.settled) {
    sendOrderEmails({
      orderId: order.id,
      userId: order.user_id,
      eventType: "payment_success",
    }).catch((err) => console.error("Async email dispatch error:", err));
  }

  return {
    success: true,
    alreadySettled: !result.settled,
    orderId: order.id,
  };
}

