import { createAdminClient } from "@/lib/supabase/admin";

export interface CodCollectionInput {
  orderId: string;
  expectedAmount: number;
  collectedAmount: number;
  collectorId: string;
  collectionStatus: "collected" | "shortfall" | "excess" | "refused";
  collectionReference?: string;
  notes?: string;
}

/**
 * Records physical doorstep cash collection independently from delivery OTP verification (2.8).
 */
export async function recordDoorstepCodCollection(
  input: CodCollectionInput
): Promise<{ success: boolean; collectionId?: string; error?: string }> {
  const adminDb = createAdminClient();

  const { data: order, error: orderErr } = await adminDb
    .from("orders")
    .select("id, total_amount, payment_method, order_status, payment_status")
    .eq("id", input.orderId)
    .single();

  if (orderErr || !order) {
    return { success: false, error: `Order ${input.orderId} not found.` };
  }

  if (order.payment_method !== "COD") {
    return { success: false, error: "Only COD orders can record cash collections." };
  }

  const { data, error } = await adminDb
    .from("cod_collections")
    .insert({
      order_id: input.orderId,
      expected_amount: input.expectedAmount,
      collected_amount: input.collectedAmount,
      collector_id: input.collectorId,
      collection_status: input.collectionStatus,
      collection_reference: input.collectionReference || null,
      notes: input.notes || null,
      collected_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to record cash collection." };
  }

  // Update order's COD collection status
  await adminDb
    .from("orders")
    .update({
      cod_settled_amount: input.collectedAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId);

  // Log in administrative audit logs
  await adminDb.from("audit_logs").insert({
    action: "COD_DOORSTEP_COLLECTION",
    model_name: "orders",
    model_id: input.orderId,
    user_id: input.collectorId,
    new_values: {
      expected: input.expectedAmount,
      collected: input.collectedAmount,
      status: input.collectionStatus,
      reference: input.collectionReference,
    },
  });

  return { success: true, collectionId: data.id };
}

export interface CodRemittanceInput {
  remittanceRef: string;
  courier?: string;
  orderId?: string;
  expectedAmount: number;
  remittedAmount: number;
  adminId: string;
  notes?: string;
}

/**
 * Reconciles courier remittance against expected COD collection (2.9).
 */
export async function reconcileCourierRemittance(
  input: CodRemittanceInput
): Promise<{
  success: boolean;
  remittanceId?: string;
  status: "matched" | "disputed" | "unmatched" | "duplicate";
  difference: number;
  error?: string;
}> {
  const adminDb = createAdminClient();

  // Check for duplicate remittance reference
  const { data: existing } = await adminDb
    .from("cod_remittances")
    .select("id, remittance_ref")
    .eq("remittance_ref", input.remittanceRef)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      status: "duplicate",
      difference: 0,
      error: `Remittance reference ${input.remittanceRef} has already been recorded.`,
    };
  }

  const difference = Number((input.expectedAmount - input.remittedAmount).toFixed(2));
  const isMatch = Math.abs(difference) <= 0.01;
  const status: "matched" | "disputed" | "unmatched" = !input.orderId
    ? "unmatched"
    : isMatch
    ? "matched"
    : "disputed";

  const { data, error } = await adminDb
    .from("cod_remittances")
    .insert({
      remittance_ref: input.remittanceRef,
      courier: input.courier || "Delhivery",
      order_id: input.orderId || null,
      expected_amount: input.expectedAmount,
      remitted_amount: input.remittedAmount,
      difference_amount: difference,
      reconciliation_status: status,
      reconciled_by: input.adminId,
      reconciled_at: new Date().toISOString(),
      notes: input.notes || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      success: false,
      status,
      difference,
      error: error?.message || "Failed to persist remittance record.",
    };
  }

  // If matched and linked to an order, update order COD settlement
  if (status === "matched" && input.orderId) {
    const nowIso = new Date().toISOString();
    await adminDb
      .from("orders")
      .update({
        cod_settlement_status: "reconciled",
        cod_settlement_ref: input.remittanceRef,
        cod_settled_amount: input.remittedAmount,
        cod_settled_at: nowIso,
        payment_status: "Paid",
        is_paid: true,
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", input.orderId);
  }

  return {
    success: true,
    remittanceId: data.id,
    status,
    difference,
  };
}
