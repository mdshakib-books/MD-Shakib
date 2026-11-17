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
 * Never overwrites courier remittance settlement (`cod_settled_amount`).
 */
export async function recordDoorstepCodCollection(
  input: CodCollectionInput,
  deps?: { adminDb?: any }
): Promise<{
  success: boolean;
  collectionId?: string;
  collectionStatus?: string;
  collectedAmount?: number;
  isPaid?: boolean;
  error?: string;
}> {
  if (!Number.isFinite(input.collectedAmount) || input.collectedAmount < 0) {
    return { success: false, error: "Collected COD amount must be non-negative." };
  }

  if (input.collectionStatus === "refused" && input.collectedAmount > 0) {
    return {
      success: false,
      error: "Refused COD collection must record 0 collected cash.",
    };
  }

  const adminDb = deps?.adminDb || createAdminClient();

  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("record_cod_collection_atomic", {
    p_order_id: input.orderId,
    p_expected_amount: Number(input.expectedAmount),
    p_collected_amount: Number(input.collectedAmount),
    p_collector_id: input.collectorId,
    p_collection_status: input.collectionStatus,
    p_collection_reference: input.collectionReference || null,
    p_notes: input.notes || null,
  });

  if (rpcErr || !(rpcRes as any)?.success) {
    return {
      success: false,
      error: (rpcRes as any)?.error || rpcErr?.message || "Failed to record cash collection.",
    };
  }

  return {
    success: true,
    collectionId: (rpcRes as any).collection_id,
    collectionStatus: (rpcRes as any).collection_status || input.collectionStatus,
    collectedAmount: Number((rpcRes as any).collected_amount ?? input.collectedAmount),
    isPaid: Boolean((rpcRes as any).is_paid),
  };
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
 * Reconciles courier bank remittance against expected COD collection (2.9).
 * Unifies `cod_remittances` ledger inserts and `orders` remittance state atomically.
 */
export async function reconcileCourierRemittance(
  input: CodRemittanceInput,
  deps?: { adminDb?: any }
): Promise<{
  success: boolean;
  remittanceId?: string;
  status: "matched" | "disputed" | "unmatched" | "duplicate";
  difference: number;
  error?: string;
}> {
  const cleanRef = String(input.remittanceRef || "").trim();
  if (!cleanRef) {
    return {
      success: false,
      status: "unmatched",
      difference: 0,
      error: "Bank remittance reference ID is required.",
    };
  }

  if (!Number.isFinite(input.remittedAmount) || input.remittedAmount < 0) {
    return {
      success: false,
      status: "disputed",
      difference: 0,
      error: "Remitted amount must be a valid non-negative number.",
    };
  }

  const adminDb = deps?.adminDb || createAdminClient();

  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("reconcile_cod_remittance_atomic", {
    p_remittance_ref: cleanRef,
    p_courier: input.courier || "Delhivery",
    p_order_id: input.orderId || null,
    p_expected_amount: Number(input.expectedAmount),
    p_remitted_amount: Number(input.remittedAmount),
    p_admin_id: input.adminId,
    p_notes: input.notes || null,
  });

  if (rpcErr || !rpcRes) {
    return {
      success: false,
      status: "disputed",
      difference: 0,
      error: rpcErr?.message || "Failed to persist remittance record.",
    };
  }

  const resObj = rpcRes as any;
  const rawStatus = resObj.status;
  const normalizedStatus: "matched" | "disputed" | "unmatched" | "duplicate" =
    rawStatus === "matched" ||
    rawStatus === "disputed" ||
    rawStatus === "unmatched" ||
    rawStatus === "duplicate"
      ? rawStatus
      : "disputed";

  return {
    success: Boolean(resObj.success),
    remittanceId: resObj.remittance_id,
    status: normalizedStatus,
    difference: Number(resObj.difference ?? 0),
    error: resObj.error || undefined,
  };
}
