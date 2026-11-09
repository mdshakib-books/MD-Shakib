"use server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

export interface CustomerCouponValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  calculatedDiscount?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number | null;
}

/**
 * Validates a promotional discount coupon on the server against the current cart subtotal (Feature 1.7).
 * Never trusts client calculations; uses server-side RPC validate_discount_coupon.
 */
export async function validateCustomerCoupon(
  code: string,
  subtotal: number
): Promise<CustomerCouponValidationResult> {
  const cleanCode = (code || "").trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: "Please enter a coupon code." };
  }

  if (typeof subtotal !== "number" || subtotal <= 0 || isNaN(subtotal)) {
    return { valid: false, error: "Cart subtotal must be greater than zero." };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || "anon";

  // Rate limit coupon attempts to prevent code enumeration attacks
  const rl = await checkRateLimit(`coupon_validate:${userId}`, "auth");
  if (!rl.allowed) {
    return { valid: false, error: "Too many coupon attempts. Please wait a moment." };
  }

  const { data, error } = await supabase.rpc("validate_discount_coupon", {
    p_code: cleanCode,
    p_subtotal: subtotal,
  });

  if (error || !data) {
    return {
      valid: false,
      error: error?.message || "Failed to validate coupon code.",
    };
  }

  const res = data as Record<string, any>;

  if (!res.valid) {
    return {
      valid: false,
      error: res.error || "This coupon is not applicable to your order.",
    };
  }

  return {
    valid: true,
    code: res.code,
    discountType: res.discount_type,
    discountValue: Number(res.discount_value),
    calculatedDiscount: Number(res.calculated_discount),
  };
}
