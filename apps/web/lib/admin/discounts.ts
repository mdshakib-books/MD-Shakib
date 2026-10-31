"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { recordAdminAuditLog } from "./audit";
import type { Database } from "@/types/database.types";

export type DiscountRow = Database["public"]["Tables"]["discounts"]["Row"];

export interface DiscountInput {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number | null;
  usage_limit?: number | null;
  valid_from?: string;
  valid_until?: string | null;
  is_active?: boolean;
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  discountId?: string;
  code?: string;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  calculatedDiscount?: number;
}

/**
 * Retrieves all promotional coupons for administrative management.
 */
export async function getAdminDiscounts(): Promise<DiscountRow[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: discounts, error } = await supabase
    .from("discounts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching discounts:", error.message);
    throw new Error(`Failed to load discounts: ${error.message}`);
  }

  return discounts || [];
}

/**
 * Creates a new discount coupon.
 */
export async function createAdminDiscount(input: DiscountInput): Promise<{
  success: boolean;
  discount?: DiscountRow;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const cleanCode = input.code?.trim().toUpperCase();

  if (!cleanCode) {
    return { success: false, error: "Coupon code is required." };
  }

  if (typeof input.discount_value !== "number" || input.discount_value <= 0 || isNaN(input.discount_value)) {
    return { success: false, error: "Discount value must be greater than zero." };
  }

  if (input.discount_type === "percentage" && input.discount_value > 100) {
    return { success: false, error: "Percentage discount cannot exceed 100%." };
  }

  const { data: newDiscount, error } = await supabase
    .from("discounts")
    .insert({
      code: cleanCode,
      discount_type: input.discount_type,
      discount_value: Number(input.discount_value),
      min_order_amount: Math.max(0, Number(input.min_order_amount || 0)),
      max_discount_amount: input.max_discount_amount ? Number(input.max_discount_amount) : null,
      usage_limit: input.usage_limit ? Math.max(1, Math.floor(input.usage_limit)) : null,
      valid_from: input.valid_from || new Date().toISOString(),
      valid_until: input.valid_until || null,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();

  if (error || !newDiscount) {
    return {
      success: false,
      error: error?.message.includes("unique")
        ? "A coupon with this code already exists."
        : error?.message || "Failed to create discount.",
    };
  }

  await recordAdminAuditLog({
    action: "CREATE",
    modelName: "discounts",
    modelId: newDiscount.id,
    newValues: newDiscount,
    changes: { code: cleanCode, discount_value: input.discount_value },
  });

  revalidatePath("/admin/discounts");
  return { success: true, discount: newDiscount };
}

/**
 * Updates an existing discount coupon.
 */
export async function updateAdminDiscount(
  id: string,
  input: Partial<DiscountInput>
): Promise<{
  success: boolean;
  discount?: DiscountRow;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("discounts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: "Discount coupon not found." };
  }

  const updateData: Database["public"]["Tables"]["discounts"]["Update"] = {};

  if (input.code !== undefined) {
    const clean = input.code.trim().toUpperCase();
    if (!clean) return { success: false, error: "Coupon code cannot be empty." };
    updateData.code = clean;
  }

  if (input.discount_type !== undefined) {
    updateData.discount_type = input.discount_type;
  }

  if (input.discount_value !== undefined) {
    if (typeof input.discount_value !== "number" || input.discount_value <= 0 || isNaN(input.discount_value)) {
      return { success: false, error: "Discount value must be greater than zero." };
    }
    if ((input.discount_type || existing.discount_type) === "percentage" && input.discount_value > 100) {
      return { success: false, error: "Percentage discount cannot exceed 100%." };
    }
    updateData.discount_value = Number(input.discount_value);
  }

  if (input.min_order_amount !== undefined) {
    updateData.min_order_amount = Math.max(0, Number(input.min_order_amount));
  }

  if (input.max_discount_amount !== undefined) {
    updateData.max_discount_amount = input.max_discount_amount ? Number(input.max_discount_amount) : null;
  }

  if (input.usage_limit !== undefined) {
    updateData.usage_limit = input.usage_limit ? Math.max(1, Math.floor(input.usage_limit)) : null;
  }

  if (input.valid_from !== undefined) {
    updateData.valid_from = input.valid_from;
  }

  if (input.valid_until !== undefined) {
    updateData.valid_until = input.valid_until || null;
  }

  if (input.is_active !== undefined) {
    updateData.is_active = Boolean(input.is_active);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("discounts")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateErr || !updated) {
    return {
      success: false,
      error: updateErr?.message.includes("unique")
        ? "Another coupon with this code already exists."
        : updateErr?.message || "Failed to update discount.",
    };
  }

  await recordAdminAuditLog({
    action: "UPDATE",
    modelName: "discounts",
    modelId: id,
    oldValues: existing,
    newValues: updated,
    changes: updateData,
  });

  revalidatePath("/admin/discounts");
  return { success: true, discount: updated };
}

/**
 * Toggles a discount coupon's active state.
 */
export async function toggleDiscountStatus(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("discounts")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  await recordAdminAuditLog({
    action: "UPDATE",
    modelName: "discounts",
    modelId: id,
    changes: { is_active: isActive },
  });

  revalidatePath("/admin/discounts");
  return { success: true };
}

/**
 * Permanently removes a discount coupon.
 */
export async function deleteAdminDiscount(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("discounts").select("*").eq("id", id).single();

  const { error } = await supabase.from("discounts").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  if (existing) {
    await recordAdminAuditLog({
      action: "DELETE",
      modelName: "discounts",
      modelId: id,
      oldValues: existing,
    });
  }

  revalidatePath("/admin/discounts");
  return { success: true };
}

/**
 * Authoritatively validates a promotional coupon code against a subtotal.
 * Available to both customer checkout and admin validation.
 */
export async function validateCoupon(
  code: string,
  subtotal: number
): Promise<CouponValidationResult> {
  const cleanCode = code?.trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: "Please enter a coupon code." };
  }

  if (typeof subtotal !== "number" || subtotal <= 0 || isNaN(subtotal)) {
    return { valid: false, error: "Order subtotal must be greater than zero." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("validate_discount_coupon", {
    p_code: cleanCode,
    p_subtotal: subtotal,
  });

  if (error || !data) {
    return {
      valid: false,
      error: error?.message || "Failed to validate coupon.",
    };
  }

  const res = data as Record<string, any>;

  if (!res.valid) {
    return {
      valid: false,
      error: res.error || "Coupon is not applicable.",
    };
  }

  return {
    valid: true,
    discountId: res.discount_id,
    code: res.code,
    discountType: res.discount_type,
    discountValue: res.discount_value,
    calculatedDiscount: res.calculated_discount,
  };
}
