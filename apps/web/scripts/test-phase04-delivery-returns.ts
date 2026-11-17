/**
 * Phase 04 Offline Verification Suite — Delivery, Returns, COD & Webhook Hardening
 *
 * Strictly offline & isolated: operates solely on an in-memory transactional DB simulator
 * and stubbed fetch/providers. Never connects to Supabase, Delhivery, Razorpay, or Resend.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  adminReviewReturnRequest,
  checkOrderReturnEligibility,
  confirmCodReturnRefundPayout,
  createCustomerReturnRequest,
  isAllowedReturnStatusTransition,
  processReturnRefund,
  scheduleReturnPickup,
} from "../lib/commerce/returns";
import {
  clearPincodeServiceabilityCache,
  computeDelhiveryWebhookEventId,
  createShipmentForOrder,
  mapDelhiveryStatusToOrderStatus,
  parseDelhiveryWebhookTimestamp,
  processDelhiveryWebhook,
  reconcileDelhiveryCODRemittance,
  reconcileUncertainDelhiveryBooking,
  validateDelhiveryBookingPayload,
} from "../lib/integrations/delhivery/service";
import {
  recordDoorstepCodCollection,
  reconcileCourierRemittance,
} from "../lib/delivery/cod";
import {
  executeDispatchedOrderCancellation,
  executeOrderCancellation,
} from "../lib/commerce/orders-core";
import { POST as delhiveryWebhookPost } from "../app/api/webhooks/delhivery/route";

let passed = 0;
let failed = 0;

async function testCase(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error("   ", err?.stack || err?.message || err);
    failed++;
  }
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ==============================================================================
// IN-MEMORY POSTGRESQL / RPC SIMULATOR MATCHING 20261113000001 GUARANTEES
// ==============================================================================

class Phase04MockDb {
  orders = new Map<string, any>();
  order_items: any[] = [];
  books = new Map<string, any>();
  profiles = new Map<string, any>();
  inventory_reservations: any[] = [];
  shipments: any[] = [];
  shipment_events: any[] = [];
  delivery_otps: any[] = [];
  return_requests = new Map<string, any>();
  return_request_items: any[] = [];
  refund_records = new Map<string, any>();
  cod_collections: any[] = [];
  cod_remittances: any[] = [];
  webhook_events = new Map<string, any>();
  audit_logs: any[] = [];
  private seq = 1;

  nextUuid(): string {
    const hex = (this.seq++).toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  }

  private isTruthyCodPayment(order: any): boolean {
    if (
      order.is_paid === true ||
      order.payment_status === "Paid" ||
      order.payment_status === "Partially Refunded" ||
      order.payment_status === "Refund Pending" ||
      order.cod_settlement_status === "reconciled" ||
      order.cod_collection_status === "collected" ||
      order.cod_collection_status === "excess"
    ) {
      return true;
    }
    return this.cod_collections.some(
      (c) =>
        c.order_id === order.id &&
        (c.collection_status === "collected" || c.collection_status === "excess") &&
        Number(c.collected_amount) > 0
    );
  }

  from(table: string) {
    const db = this;
    const state: {
      op: "select" | "update" | "insert";
      payload: any;
      filters: Array<(row: any) => boolean>;
    } = { op: "select", payload: null, filters: [] };

    const getRows = (): any[] => {
      switch (table) {
        case "orders":
          return Array.from(db.orders.values());
        case "order_items":
          return db.order_items.map((oi) => ({
            ...oi,
            books: db.books.get(oi.book_id) || null,
          }));
        case "books":
          return Array.from(db.books.values());
        case "profiles":
          return Array.from(db.profiles.values());
        case "inventory_reservations":
          return db.inventory_reservations;
        case "shipments":
          return db.shipments;
        case "shipment_events":
          return db.shipment_events;
        case "delivery_otps":
          return db.delivery_otps;
        case "return_requests":
          return Array.from(db.return_requests.values()).map((r) => ({
            ...r,
            return_request_items: db.return_request_items.filter(
              (ri) => ri.return_request_id === r.id
            ),
          }));
        case "return_request_items":
          return db.return_request_items;
        case "refund_records":
          return Array.from(db.refund_records.values());
        case "cod_collections":
          return db.cod_collections;
        case "cod_remittances":
          return db.cod_remittances;
        case "webhook_events":
          return Array.from(db.webhook_events.values());
        case "audit_logs":
          return db.audit_logs;
        default:
          return [];
      }
    };

    const validateMutation = (row: any, isUpdate: boolean, prevRow?: any): string | null => {
      if (table === "return_requests") {
        if (row.pickup_awb && /^(REV-|MOCK)/i.test(String(row.pickup_awb))) {
          return "Synthetic reverse pickup AWBs (e.g. REV-*) are prohibited.";
        }
        if (isUpdate && prevRow && prevRow.status !== row.status) {
          if (!isAllowedReturnStatusTransition(prevRow.status, row.status)) {
            return `Invalid return request status transition from "${prevRow.status}" to "${row.status}".`;
          }
        }
      }
      if (table === "refund_records") {
        if (row.gateway_refund_id && /^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)/i.test(row.gateway_refund_id)) {
          return "Synthetic gateway refund identifiers are prohibited.";
        }
        if (row.payout_reference && /^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)/i.test(row.payout_reference)) {
          return "Synthetic payout references are prohibited.";
        }
        const ord = db.orders.get(row.order_id);
        if (ord && String(ord.payment_method).toUpperCase() === "COD" && !db.isTruthyCodPayment(ord)) {
          return `Cannot create or update refund record for uncollected COD order ${ord.id}.`;
        }
        if (ord && String(ord.payment_method).toUpperCase() === "COD" && row.status === "processed" && !row.payout_reference) {
          return "Confirmed offline COD refund completion requires a non-empty payout_reference.";
        }
      }
      if (table === "orders" && isUpdate && String(row.payment_method).toUpperCase() === "COD") {
        if (!db.isTruthyCodPayment(row)) {
          if (
            ["pending", "processing", "processed"].includes(String(row.refund_status || "")) ||
            Number(row.refund_amount || 0) > 0 ||
            ["Refund Pending", "Partially Refunded", "Refunded"].includes(row.payment_status)
          ) {
            return "Uncollected COD order cannot enter a refund or refunded payment state.";
          }
        }
      }
      return null;
    };

    const chain: any = {
      select() {
        return chain;
      },
      insert(payload: any) {
        state.op = "insert";
        const items = Array.isArray(payload) ? payload : [payload];
        const inserted: any[] = [];
        for (const item of items) {
          const row = {
            id: item.id || db.nextUuid(),
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
            ...item,
          };

          if (table === "webhook_events" && db.webhook_events.has(row.event_id)) {
            const errResult = { data: null, error: { message: "duplicate key value violates unique constraint webhook_events_event_id_key" } };
            return {
              ...chain,
              select: () => ({ maybeSingle: async () => errResult, single: async () => errResult, then: (r: any) => r(errResult) }),
              then: (r: any) => r(errResult),
            };
          }

          const errMsg = validateMutation(row, false);
          if (errMsg) {
            const errResult = { data: null, error: { message: errMsg } };
            return {
              ...chain,
              select: () => ({ maybeSingle: async () => errResult, single: async () => errResult, then: (r: any) => r(errResult) }),
              then: (r: any) => r(errResult),
            };
          }

          if (table === "orders") db.orders.set(row.id, row);
          else if (table === "order_items") db.order_items.push(row);
          else if (table === "shipments") db.shipments.push(row);
          else if (table === "shipment_events") db.shipment_events.push(row);
          else if (table === "delivery_otps") db.delivery_otps.push(row);
          else if (table === "return_requests") db.return_requests.set(row.id, row);
          else if (table === "return_request_items") db.return_request_items.push(row);
          else if (table === "refund_records") db.refund_records.set(row.id, row);
          else if (table === "cod_collections") db.cod_collections.push(row);
          else if (table === "cod_remittances") db.cod_remittances.push(row);
          else if (table === "webhook_events") db.webhook_events.set(row.event_id, row);
          else if (table === "audit_logs") db.audit_logs.push(row);
          inserted.push(row);
        }
        const okRes = { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
        return {
          ...chain,
          select: () => ({
            maybeSingle: async () => okRes,
            single: async () => okRes,
            then: (r: any) => r(okRes),
          }),
          then: (r: any) => r(okRes),
        };
      },
      update(payload: any) {
        state.op = "update";
        state.payload = payload;
        return chain;
      },
      eq(col: string, val: any) {
        state.filters.push((r) => r[col] === val);
        return chain;
      },
      neq(col: string, val: any) {
        state.filters.push((r) => r[col] !== val);
        return chain;
      },
      is(col: string, val: any) {
        state.filters.push((r) => r[col] === val);
        return chain;
      },
      in(col: string, vals: any[]) {
        state.filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      not(col: string, op: string, rawVal: any) {
        if (op === "eq") {
          state.filters.push((r) => r[col] !== rawVal);
        } else if (op === "in" && String(rawVal).includes("cancelled")) {
          state.filters.push((r) => !["cancelled", "failed"].includes(r[col]));
        }
        return chain;
      },
      order() {
        return chain;
      },
      privateApplyUpdate(): { rows: any[]; error: { message: string } | null } {
        const matched = getRows().filter((r) => state.filters.every((f) => f(r)));
        for (const row of matched) {
          const prev = { ...row };
          const next = { ...row, ...state.payload };
          const errMsg = validateMutation(next, true, prev);
          if (errMsg) return { rows: [], error: { message: errMsg } };
        }
        const updatedRows: any[] = [];
        for (const row of matched) {
          if (table === "orders") {
            const stored = db.orders.get(row.id);
            Object.assign(stored, state.payload);
            updatedRows.push(stored);
          } else if (table === "return_requests") {
            const stored = db.return_requests.get(row.id);
            Object.assign(stored, state.payload);
            updatedRows.push(stored);
          } else if (table === "refund_records") {
            const stored = db.refund_records.get(row.id);
            Object.assign(stored, state.payload);
            updatedRows.push(stored);
          } else if (table === "webhook_events") {
            const stored = db.webhook_events.get(row.event_id);
            Object.assign(stored, state.payload);
            updatedRows.push(stored);
          } else {
            Object.assign(row, state.payload);
            updatedRows.push(row);
          }
        }
        return { rows: updatedRows, error: null };
      },
      async single() {
        if (state.op === "update") {
          const { rows, error } = chain.privateApplyUpdate();
          if (error) return { data: null, error };
          return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "No matching row" } };
        }
        const rows = getRows().filter((r) => state.filters.every((f) => f(r)));
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "Not found" } };
      },
      async maybeSingle() {
        if (state.op === "update") {
          const { rows, error } = chain.privateApplyUpdate();
          if (error) return { data: null, error };
          return { data: rows[0] || null, error: null };
        }
        const rows = getRows().filter((r) => state.filters.every((f) => f(r)));
        return { data: rows[0] || null, error: null };
      },
      then(resolve: any) {
        if (state.op === "update") {
          const { rows, error } = chain.privateApplyUpdate();
          return resolve(error ? { data: null, error } : { data: rows, error: null });
        }
        const rows = getRows().filter((r) => state.filters.every((f) => f(r)));
        return resolve({ data: rows, error: null });
      },
    };
    return chain;
  }

  async rpc(fnName: string, args: Record<string, any>) {
    const now = new Date().toISOString();

    if (fnName === "record_cod_collection_atomic") {
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: { success: false, error: "Order not found." }, error: null };
      const actor = this.profiles.get(args.p_collector_id);
      if (!actor || !["super_admin", "admin"].includes(actor.role)) {
        return { data: null, error: { message: "Unauthorized: orders.settle_cod permission required." } };
      }
      if (String(order.payment_method).toUpperCase() !== "COD") {
        return { data: { success: false, error: "Only COD orders can record cash collections." }, error: null };
      }
      if (!["Out for Delivery", "Delivered"].includes(order.order_status)) {
        return {
          data: {
            success: false,
            error: `Doorstep COD collection is only allowed when order is Out for Delivery or Delivered (current: ${order.order_status}).`,
          },
          error: null,
        };
      }
      if (
        ["collected", "excess"].includes(order.cod_collection_status) &&
        ["collected", "excess"].includes(args.p_collection_status)
      ) {
        return {
          data: { success: false, error: "COD cash collection has already been recorded for this order." },
          error: null,
        };
      }
      if (args.p_collection_status === "refused" && args.p_collected_amount > 0) {
        return { data: { success: false, error: "Refused COD collection must have collected_amount = 0." }, error: null };
      }

      const cid = this.nextUuid();
      this.cod_collections.push({
        id: cid,
        order_id: order.id,
        expected_amount: args.p_expected_amount,
        collected_amount: args.p_collected_amount,
        collector_id: args.p_collector_id,
        collection_status: args.p_collection_status,
        collection_reference: args.p_collection_reference,
        notes: args.p_notes,
        collected_at: now,
      });

      const isPaid =
        Boolean(order.is_paid) ||
        (["collected", "excess"].includes(args.p_collection_status) &&
          Number(args.p_collected_amount) >= Number(order.total_amount) - 0.01);

      order.cod_collection_status = args.p_collection_status;
      order.cod_collected_amount = args.p_collected_amount;
      order.cod_collected_at = now;
      order.is_paid = isPaid;
      if (isPaid && order.payment_status === "Pending") {
        order.payment_status = "Paid";
        order.paid_at = order.paid_at || now;
      }
      if (
        (order.cod_settlement_status === "unsettled" || !order.cod_settlement_status) &&
        ["collected", "excess", "shortfall"].includes(args.p_collection_status)
      ) {
        order.cod_settlement_status = "pending";
      }
      // Deliberately keep cod_settled_amount UNCHANGED (remittance-only)

      this.audit_logs.push({ action: "COD_DOORSTEP_COLLECTION", model_id: order.id, user_id: args.p_collector_id });
      return {
        data: {
          success: true,
          collection_id: cid,
          collection_status: args.p_collection_status,
          collected_amount: args.p_collected_amount,
          is_paid: isPaid,
        },
        error: null,
      };
    }

    if (fnName === "reconcile_cod_remittance_atomic") {
      const cleanRef = String(args.p_remittance_ref || "").trim();
      if (this.cod_remittances.some((r) => r.remittance_ref === cleanRef)) {
        return {
          data: {
            success: false,
            status: "duplicate",
            difference: 0,
            error: `Remittance reference ${cleanRef} has already been recorded.`,
          },
          error: null,
        };
      }
      const order = args.p_order_id ? this.orders.get(args.p_order_id) : null;
      if (args.p_order_id && !order) {
        return { data: { success: false, status: "unmatched", difference: 0, error: "Order not found." }, error: null };
      }
      if (order) {
        if (String(order.payment_method).toUpperCase() !== "COD") {
          return { data: { success: false, status: "invalid", difference: 0, error: "Only COD orders can be reconciled." }, error: null };
        }
        if (order.order_status !== "Delivered") {
          return {
            data: { success: false, status: "invalid", difference: 0, error: `Cannot reconcile COD before verified delivery (current: ${order.order_status}).` },
            error: null,
          };
        }
        if (order.cod_settlement_status === "reconciled") {
          return {
            data: { success: false, status: "duplicate", difference: 0, error: "COD remittance has already been reconciled for this order." },
            error: null,
          };
        }
      }
      const expected = Number(args.p_expected_amount ?? order?.total_amount ?? args.p_remitted_amount);
      const difference = Number((expected - Number(args.p_remitted_amount)).toFixed(2));
      const status = !args.p_order_id ? "unmatched" : Math.abs(difference) <= 0.01 ? "matched" : "disputed";
      const remId = this.nextUuid();
      this.cod_remittances.push({
        id: remId,
        remittance_ref: cleanRef,
        courier: args.p_courier || "Delhivery",
        order_id: args.p_order_id || null,
        expected_amount: expected,
        remitted_amount: args.p_remitted_amount,
        difference_amount: difference,
        reconciliation_status: status,
        reconciled_by: args.p_admin_id,
        reconciled_at: now,
      });

      if (order) {
        if (status === "matched") {
          order.cod_settlement_status = "reconciled";
          order.cod_settlement_ref = cleanRef;
          order.cod_settled_amount = args.p_remitted_amount;
          order.cod_settled_at = now;
          if (!order.cod_collection_status || order.cod_collection_status === "uncollected") {
            order.cod_collection_status = "collected";
            order.cod_collected_amount = args.p_remitted_amount;
          }
          if (!["Refund Pending", "Partially Refunded", "Refunded"].includes(order.payment_status)) {
            order.payment_status = "Paid";
          }
          order.is_paid = true;
          order.paid_at = order.paid_at || now;
        } else if (status === "disputed") {
          order.cod_settlement_status = "disputed";
          order.cod_settlement_ref = cleanRef;
          order.cod_settled_amount = args.p_remitted_amount;
        }
        this.audit_logs.push({
          action: status === "matched" ? "COD_SETTLEMENT_RECONCILED" : "COD_SETTLEMENT_DISPUTE",
          model_id: order.id,
          user_id: args.p_admin_id,
        });
      }

      return {
        data: {
          success: status !== "disputed",
          remittance_id: remId,
          status,
          difference,
          error: status === "disputed" ? `Amount mismatch: expected ₹${expected}, received ₹${args.p_remitted_amount}` : null,
        },
        error: null,
      };
    }

    if (fnName === "initiate_return_refund_atomic") {
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: { success: false, error: "Order not found." }, error: null };
      const retReq = args.p_return_id ? this.return_requests.get(args.p_return_id) : null;
      if (retReq && ["submitted", "under_review", "info_requested", "rejected", "cancelled"].includes(retReq.status)) {
        return {
          data: { success: false, error: `Return request must be approved or received before authorizing a refund (current: ${retReq.status}).` },
          error: null,
        };
      }
      const isCod = String(order.payment_method).toUpperCase() === "COD";
      if (isCod && !this.isTruthyCodPayment(order)) {
        return {
          data: { success: false, error: "COD payment collection has not been confirmed for this order." },
          error: null,
        };
      }
      if (!isCod && !order.is_paid && !["Paid", "Partially Refunded", "Refund Pending"].includes(order.payment_status)) {
        return { data: { success: false, error: "Prepaid online order payment has not been captured yet." }, error: null };
      }
      if (args.p_return_id) {
        const existing = Array.from(this.refund_records.values()).find(
          (r) => r.return_request_id === args.p_return_id && ["pending", "processing", "processed"].includes(r.status)
        );
        if (existing) {
          return {
            data: {
              success: true,
              already_initiated: true,
              refund_record_id: existing.id,
              status: existing.status,
              amount: existing.amount,
              payment_channel: existing.payment_channel,
            },
            error: null,
          };
        }
      }

      const settled = Array.from(this.refund_records.values())
        .filter((r) => r.order_id === order.id && r.status === "processed")
        .reduce((s, r) => s + Number(r.amount), 0);
      const pending = Array.from(this.refund_records.values())
        .filter((r) => r.order_id === order.id && ["pending", "processing"].includes(r.status))
        .reduce((s, r) => s + Number(r.amount), 0);
      const balance = Math.max(0, Number(order.total_amount) - (settled + pending));
      if (Number(args.p_amount) > balance) {
        return {
          data: { success: false, error: `Refund amount ₹${args.p_amount} exceeds available refundable balance ₹${balance}` },
          error: null,
        };
      }
      const recId = this.nextUuid();
      this.refund_records.set(recId, {
        id: recId,
        order_id: order.id,
        return_request_id: args.p_return_id || null,
        amount: args.p_amount,
        status: "pending",
        gateway_status: isCod ? "awaiting_offline_payout" : "pending",
        payment_channel: isCod ? "cod_offline" : "razorpay",
        reason: args.p_reason,
        authorized_by: args.p_admin_id,
        idempotency_key: args.p_return_id ? `refund:return:${args.p_return_id}` : null,
      });
      return {
        data: { success: true, refund_record_id: recId, order_id: order.id, amount: args.p_amount, refundable_balance_remaining: balance - args.p_amount },
        error: null,
      };
    }

    if (fnName === "complete_cod_refund_atomic") {
      const rec = this.refund_records.get(args.p_refund_record_id);
      if (!rec) return { data: { success: false, error: "Refund record not found." }, error: null };
      const order = this.orders.get(rec.order_id);
      if (!order || String(order.payment_method).toUpperCase() !== "COD") {
        return { data: { success: false, error: "complete_cod_refund_atomic is only for COD orders." }, error: null };
      }
      const cleanRef = String(args.p_payout_reference || "").trim();
      if (cleanRef.length < 4 || /^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)/i.test(cleanRef)) {
        return { data: { success: false, error: "Genuine external payout reference is required." }, error: null };
      }
      if (rec.status === "processed") {
        if (rec.payout_reference === cleanRef) {
          return {
            data: { success: true, already_processed: true, refund_record_id: rec.id, payout_reference: rec.payout_reference, amount: rec.amount },
            error: null,
          };
        }
        return { data: { success: false, error: `COD refund already completed with reference ${rec.payout_reference}` }, error: null };
      }
      const dupPayout = Array.from(this.refund_records.values()).some(
        (r) => r.id !== rec.id && r.payout_reference === cleanRef
      );
      if (dupPayout) {
        return { data: { success: false, error: `Payout reference ${cleanRef} already used.` }, error: null };
      }

      rec.status = "processed";
      rec.payment_channel = args.p_payout_channel;
      rec.gateway_status = "offline_payout_confirmed";
      rec.payout_reference = cleanRef;
      rec.payout_confirmed_by = args.p_admin_id;
      rec.payout_confirmed_at = now;
      rec.processed_at = now;

      if (rec.return_request_id) {
        const ret = this.return_requests.get(rec.return_request_id);
        if (ret) {
          ret.status = "completed";
          ret.resolved_by = args.p_admin_id;
          ret.resolved_at = now;
        }
      }

      const priorSettled = Array.from(this.refund_records.values())
        .filter((r) => r.order_id === order.id && r.status === "processed")
        .reduce((s, r) => s + Number(r.amount), 0);
      const payStatus = priorSettled >= Number(order.total_amount) - 0.01 ? "Refunded" : "Partially Refunded";
      order.refund_status = "processed";
      order.refund_amount = priorSettled;
      order.cod_refund_reference = cleanRef;
      order.refunded_at = now;
      order.payment_status = payStatus;

      this.audit_logs.push({ action: "CONFIRM_COD_REFUND_PAYOUT", model_id: order.id, user_id: args.p_admin_id });
      return {
        data: { success: true, status: "processed", refund_record_id: rec.id, payout_reference: cleanRef, amount: rec.amount, payment_status: payStatus },
        error: null,
      };
    }

    if (fnName === "cancel_order_atomic") {
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: null, error: { message: "Order not found" } };
      if (["Shipped", "Out for Delivery"].includes(order.order_status)) {
        return { data: null, error: { message: "Cannot cancel dispatched order via cancel_order_atomic" } };
      }
      for (const res of this.inventory_reservations.filter(
        (r) => r.order_id === order.id && ["reserved", "committed"].includes(r.status)
      )) {
        const b = this.books.get(res.book_id);
        if (b) b.stock += res.quantity;
        res.status = "released";
      }
      order.order_status = "Cancelled";
      order.cancel_reason = args.p_cancel_reason;
      if (order.payment_method === "COD") {
        order.refund_status = "not_required";
        order.refund_amount = null;
      } else if (order.is_paid || order.payment_status === "Paid") {
        order.payment_status = "Refund Pending";
        order.refund_status = "pending";
        order.refund_amount = order.total_amount;
      }
      return { data: true, error: null };
    }

    if (fnName === "cancel_dispatched_order_atomic") {
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: { success: false, error: "Order not found" }, error: null };
      if (!["Shipped", "Out for Delivery"].includes(order.order_status)) {
        return { data: { success: false, error: "Not dispatched" }, error: null };
      }
      if (!args.p_courier_confirmed) {
        return { data: { success: false, error: "Courier cancellation not confirmed" }, error: null };
      }
      order.order_status = "Cancelled";
      order.shipping_booking_status = "cancelled";
      order.cancel_reason = args.p_cancel_reason;
      if (order.payment_method === "COD") {
        order.refund_status = "not_required";
        order.refund_amount = null;
      }
      return { data: { success: true, order_id: order.id }, error: null };
    }

    // Leave apply_delhivery_webhook_atomic unhandled to test TS path or simulate RPC explicitly in dedicated test!
    return { data: null, error: { message: `Unhandled RPC: ${fnName}` } };
  }
}

async function runTests() {
  console.log("\n=== PHASE 04 VERIFICATION: DELIVERY, RETURNS, COD & WEBHOOK HARDENING ===\n");

  // --------------------------------------------------------------------------
  // 1. REVERSE PICKUP & RETURN MANAGEMENT
  // --------------------------------------------------------------------------
  await testCase("R1: Reverse pickup never generates synthetic REV-* AWBs in mock or sandbox/live modes", async () => {
    const prev = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_MOCK_SERVICES: process.env.ALLOW_MOCK_SERVICES,
      ENABLE_DELHIVERY: process.env.ENABLE_DELHIVERY,
      DELHIVERY_MODE: process.env.DELHIVERY_MODE,
      DELHIVERY_TOKEN: process.env.DELHIVERY_TOKEN,
      DELHIVERY_WEBHOOK_SECRET: process.env.DELHIVERY_WEBHOOK_SECRET,
    };

    try {
      // Explicit mock mode: MUST still reject instead of faking REV-* AWB!
      process.env.APP_ENV = "local";
      process.env.ALLOW_MOCK_SERVICES = "true";
      process.env.ENABLE_DELHIVERY = "true";
      process.env.DELHIVERY_MODE = "mock";
      process.env.DELHIVERY_TOKEN = "";
      process.env.DELHIVERY_WEBHOOK_SECRET = "local-webhook-secret-xyz";

      const mockRes = await scheduleReturnPickup("00000000-0000-4000-8000-000000000001");
      assert.strictEqual(mockRes.success, false);
      assert.strictEqual(mockRes.unavailable, true);
      assert.strictEqual(mockRes.pickupAwb, undefined);

      // Configured sandbox mode: MUST fail closed without inventing AWBs
      process.env.APP_ENV = "staging";
      process.env.ALLOW_MOCK_SERVICES = "false";
      process.env.DELHIVERY_MODE = "sandbox";
      process.env.DELHIVERY_TOKEN = "sandbox-real-token-xyz-1234";
      process.env.DELHIVERY_WEBHOOK_SECRET = "sandbox-webhook-secret-xyz";

      const sandboxRes = await scheduleReturnPickup("00000000-0000-4000-8000-000000000001");
      assert.strictEqual(sandboxRes.success, false);
      assert.strictEqual(sandboxRes.unavailable, true);
      assert.strictEqual(sandboxRes.pickupAwb, undefined);
      assert.match(sandboxRes.error || "", /not implemented/i);
    } finally {
      restoreEnv(prev);
    }
  });

  await testCase("R2: Return request workflow enforces valid state transitions, blocks REV-* AWB writes & logs audit", async () => {
    const db = new Phase04MockDb();
    const userId = db.nextUuid();
    const adminId = db.nextUuid();
    const orderId = db.nextUuid();
    const bookId = db.nextUuid();
    const itemId = db.nextUuid();

    db.orders.set(orderId, {
      id: orderId,
      user_id: userId,
      order_status: "Delivered",
      payment_method: "ONLINE",
      payment_status: "Paid",
      is_paid: true,
      delivered_at: new Date().toISOString(),
      total_amount: 750,
      address_snapshot: { full_name: "Amina", city: "Delhi", state: "Delhi", pincode: "110025", phone: "9876543210" },
    });
    db.order_items.push({ id: itemId, order_id: orderId, book_id: bookId, title: "Riyad us Saliheen", quantity: 1, price: 750 });

    const elig = await checkOrderReturnEligibility(orderId, userId, { adminDb: db });
    assert.strictEqual(elig.isEligible, true);

    const created = await createCustomerReturnRequest(
      {
        orderId,
        userId,
        requestType: "return_refund",
        reason: "Damaged spine",
        items: [{ orderItemId: itemId, bookId, quantity: 1 }],
      },
      { adminDb: db }
    );
    assert.strictEqual(created.success, true);
    const retId = created.returnRequestId!;

    // DB trigger simulation blocks synthetic REV-* pickup_awb insertion
    const revAttempt = await db
      .from("return_requests")
      .update({ pickup_awb: "REV-123456" })
      .eq("id", retId);
    assert.ok((revAttempt as any).error, "DB constraint blocks synthetic REV-* AWB");

    // Cannot mark received directly from submitted without approval
    const badRecv = await adminReviewReturnRequest({ returnId: retId, adminId, action: "mark_received" }, { adminDb: db });
    assert.strictEqual(badRecv.success, false);

    // Approve -> Received -> audit logged
    const approved = await adminReviewReturnRequest({ returnId: retId, adminId, action: "approve" }, { adminDb: db });
    assert.strictEqual(approved.success, true);
    assert.strictEqual(approved.status, "approved");

    const received = await adminReviewReturnRequest({ returnId: retId, adminId, action: "mark_received", adminNotes: "Verified sealed parcel" }, { adminDb: db });
    assert.strictEqual(received.success, true);
    assert.strictEqual(received.status, "received");
    assert.ok(db.audit_logs.some((l) => l.action === "RETURN_REQUEST_REVIEWED" && l.model_id === retId));

    // Cannot reject already received return
    const badReject = await adminReviewReturnRequest({ returnId: retId, adminId, action: "reject", rejectionReason: "Late reject" }, { adminDb: db });
    assert.strictEqual(badReject.success, false);
  });

  // --------------------------------------------------------------------------
  // 2. DELHIVERY FORWARD SHIPMENT BOOKING VALIDATION & RECOVERY
  // --------------------------------------------------------------------------
  await testCase("F1: Forward shipment booking validates complete payload before locking & verifies COD/Prepaid payload fields", async () => {
    const prev = {
      APP_ENV: process.env.APP_ENV,
      ENABLE_DELHIVERY: process.env.ENABLE_DELHIVERY,
      DELHIVERY_MODE: process.env.DELHIVERY_MODE,
      DELHIVERY_TOKEN: process.env.DELHIVERY_TOKEN,
      DELHIVERY_WEBHOOK_SECRET: process.env.DELHIVERY_WEBHOOK_SECRET,
      DELHIVERY_PICKUP_LOCATION: process.env.DELHIVERY_PICKUP_LOCATION,
    };

    try {
      process.env.APP_ENV = "staging";
      process.env.ENABLE_DELHIVERY = "true";
      process.env.DELHIVERY_MODE = "sandbox";
      process.env.DELHIVERY_TOKEN = "sandbox-real-token-xyz-1234";
      process.env.DELHIVERY_WEBHOOK_SECRET = "sandbox-webhook-secret-xyz";
      process.env.DELHIVERY_PICKUP_LOCATION = "Okhla Hub";

      const db = new Phase04MockDb();
      const badOrderId = db.nextUuid();
      db.orders.set(badOrderId, {
        id: badOrderId,
        order_number: "MDS-100991",
        order_status: "Confirmed",
        payment_method: "COD",
        payment_status: "Pending",
        shipping_booking_status: "unbooked",
        shipping_awb: null,
        total_amount: 650,
        address_snapshot: {
          full_name: "Tariq",
          house_no: "12",
          area: "Nizamuddin",
          city: "New Delhi",
          state: "Delhi",
          pincode: "000123", // Invalid Indian pincode (starts with 0)
          phone: "123", // Invalid phone
        },
      });

      let fetchCalled = false;
      await assert.rejects(
        () =>
          createShipmentForOrder(badOrderId, {
            adminDb: db,
            fetchFn: async () => {
              fetchCalled = true;
              return new Response("{}", { status: 200 });
            },
          }),
        /pincode|mobile/i
      );
      assert.strictEqual(fetchCalled, false, "Must fail validation BEFORE calling Delhivery API");
      assert.strictEqual(
        db.orders.get(badOrderId).shipping_booking_status,
        "unbooked",
        "Must fail BEFORE acquiring booking_in_progress lock"
      );

      // Valid COD order with book weights & phone formatting "+91..."
      const codOrderId = db.nextUuid();
      const bookId = db.nextUuid();
      db.books.set(bookId, { id: bookId, title: "Sahih Al-Bukhari Vol 1", weight_grams: 850, length_cm: 24, width_cm: 16, height_cm: 5 });
      db.order_items.push({ id: db.nextUuid(), order_id: codOrderId, book_id: bookId, title: "Sahih Al-Bukhari Vol 1", quantity: 2, price: 600 });
      db.orders.set(codOrderId, {
        id: codOrderId,
        order_number: "MDS-100992",
        order_status: "Packed",
        payment_method: "COD",
        payment_status: "Pending",
        is_paid: false,
        shipping_booking_status: "unbooked",
        shipping_awb: null,
        total_amount: 1200,
        address_snapshot: {
          full_name: "Salman Khan",
          house_no: "Flat 4B",
          area: "Shaheen Bagh",
          city: "New Delhi",
          state: "Delhi",
          pincode: "110025",
          phone: "+91 98111 22334",
          address_type: "Home",
        },
      });

      let capturedBody = "";
      const codBooked = await createShipmentForOrder(codOrderId, {
        adminDb: db,
        shippingMode: "Express",
        fetchFn: async (_url, init) => {
          capturedBody = String(init?.body || "");
          return new Response(
            JSON.stringify({
              success: true,
              packages: [{ waybill: "1491234567890", status: "Success" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        },
      });

      assert.strictEqual(codBooked.awb, "1491234567890");
      assert.strictEqual(db.orders.get(codOrderId).shipping_pickup_scheduled, false, "Must NOT set pickup_scheduled=true before pickup API");
      const parsedForm = new URLSearchParams(capturedBody);
      const sentPayload = JSON.parse(parsedForm.get("data") || "{}");
      assert.strictEqual(sentPayload.pickup_location.name, "Okhla Hub");
      assert.strictEqual(sentPayload.shipments[0].payment_mode, "COD");
      assert.strictEqual(sentPayload.shipments[0].cod_amount, 1200);
      assert.strictEqual(sentPayload.shipments[0].total_amount, 1200);
      assert.strictEqual(sentPayload.shipments[0].phone, "9811122334");
      assert.strictEqual(sentPayload.shipments[0].weight, "1700");
      assert.strictEqual(sentPayload.shipments[0].hsn_code, "4901");
      assert.strictEqual(sentPayload.shipments[0].shipping_mode, "Express");

      // Provider soft-fail (HTTP 200 with pkg.status="Fail") marks booking_failed & rejects synthetic waybill
      const softFailId = db.nextUuid();
      db.orders.set(softFailId, {
        id: softFailId,
        order_number: "MDS-100993",
        order_status: "Confirmed",
        payment_method: "ONLINE",
        payment_status: "Paid",
        shipping_booking_status: "unbooked",
        shipping_awb: null,
        total_amount: 500,
        address_snapshot: {
          full_name: "Yusuf",
          house_no: "5",
          area: "Batla House",
          city: "Delhi",
          state: "Delhi",
          pincode: "110025",
          phone: "9876500001",
        },
      });

      await assert.rejects(
        () =>
          createShipmentForOrder(softFailId, {
            adminDb: db,
            fetchFn: async () =>
              new Response(
                JSON.stringify({
                  success: true,
                  packages: [{ status: "Fail", remarks: ["Invalid pickup warehouse"] }],
                }),
                { status: 200 }
              ),
          }),
        /Invalid pickup warehouse/i
      );
      assert.strictEqual(db.orders.get(softFailId).shipping_booking_status, "booking_failed");
      assert.strictEqual(db.orders.get(softFailId).order_status, "Confirmed");
    } finally {
      restoreEnv(prev);
    }
  });

  await testCase("F2: Uncertain Delhivery booking safely recovers existing AWB or clears without duplicate manifest", async () => {
    const prev = {
      APP_ENV: process.env.APP_ENV,
      ENABLE_DELHIVERY: process.env.ENABLE_DELHIVERY,
      DELHIVERY_MODE: process.env.DELHIVERY_MODE,
      DELHIVERY_TOKEN: process.env.DELHIVERY_TOKEN,
      DELHIVERY_WEBHOOK_SECRET: process.env.DELHIVERY_WEBHOOK_SECRET,
    };

    try {
      process.env.APP_ENV = "staging";
      process.env.ENABLE_DELHIVERY = "true";
      process.env.DELHIVERY_MODE = "sandbox";
      process.env.DELHIVERY_TOKEN = "sandbox-real-token-xyz-1234";
      process.env.DELHIVERY_WEBHOOK_SECRET = "sandbox-webhook-secret-xyz";

      const db = new Phase04MockDb();
      const orderId = db.nextUuid();
      db.orders.set(orderId, {
        id: orderId,
        order_number: "MDS-100777",
        order_status: "Packed",
        payment_method: "ONLINE",
        payment_status: "Paid",
        shipping_booking_status: "booking_uncertain",
        shipping_awb: null,
        total_amount: 800,
      });

      // Case A: Delhivery lookup reveals manifest DID go through before timeout -> recover AWB cleanly
      const recovered = await reconcileUncertainDelhiveryBooking(orderId, {
        adminDb: db,
        fetchFn: async (url) => {
          assert.ok(String(url).includes("ref_ids=MDS-100777"));
          return new Response(
            JSON.stringify({ ShipmentData: [{ Shipment: { AWB: "1498887776661" } }] }),
            { status: 200 }
          );
        },
      });
      assert.strictEqual(recovered.success, true);
      assert.strictEqual(recovered.recovered, true);
      assert.strictEqual(recovered.awb, "1498887776661");
      assert.strictEqual(db.orders.get(orderId).order_status, "Shipped");
      assert.strictEqual(db.orders.get(orderId).shipping_booking_status, "booked");

      // Case B: Empty ShipmentData confirms nothing was booked -> unlocks to booking_failed
      const orderId2 = db.nextUuid();
      db.orders.set(orderId2, {
        id: orderId2,
        order_number: "MDS-100778",
        order_status: "Packed",
        payment_method: "COD",
        payment_status: "Pending",
        shipping_booking_status: "booking_uncertain",
        shipping_awb: null,
        total_amount: 500,
      });

      const cleared = await reconcileUncertainDelhiveryBooking(orderId2, {
        adminDb: db,
        fetchFn: async () => new Response(JSON.stringify({ ShipmentData: [] }), { status: 200 }),
      });
      assert.strictEqual(cleared.success, true);
      assert.strictEqual(cleared.clearedToRetry, true);
      assert.strictEqual(db.orders.get(orderId2).shipping_booking_status, "booking_failed");
    } finally {
      restoreEnv(prev);
    }
  });

  // --------------------------------------------------------------------------
  // 3. ALL COD LIFECYCLE, CANCELLATION, RTO & REFUND SCENARIOS
  // --------------------------------------------------------------------------
  await testCase("C1-C6: COD placed -> shipped -> OFD -> delivered -> doorstep collection -> remittance reconciliation & RTO", async () => {
    const db = new Phase04MockDb();
    const adminId = db.nextUuid();
    db.profiles.set(adminId, { id: adminId, role: "admin", is_blocked: false, is_deleted: false });

    const codOrderId = db.nextUuid();
    db.orders.set(codOrderId, {
      id: codOrderId,
      order_number: "MDS-200101",
      user_id: db.nextUuid(),
      order_status: "Shipped",
      payment_method: "COD",
      payment_status: "Pending",
      is_paid: false,
      cod_collection_status: "uncollected",
      cod_settlement_status: "unsettled",
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_booking_status: "booked",
      shipping_awb: "1490001112223",
      total_amount: 950,
    });

    // Webhook: Out for Delivery -> remains unpaid
    const ofdRes = await processDelhiveryWebhook(
      { waybill: "1490001112223", status: "Out for Delivery", StatusDateTime: "2026-11-11T10:00:00Z" },
      { adminDb: db }
    );
    assert.strictEqual(ofdRes.status, "updated");
    assert.strictEqual(db.orders.get(codOrderId).payment_status, "Pending");
    assert.strictEqual(db.orders.get(codOrderId).is_paid, false);

    // Webhook: Delivered -> cod_settlement_status = pending, still unpaid until collected/reconciled
    const dlRes = await processDelhiveryWebhook(
      { waybill: "1490001112223", status: "DL", StatusDateTime: "2026-11-11T14:00:00Z" },
      { adminDb: db }
    );
    assert.strictEqual(dlRes.status, "updated");
    assert.strictEqual(db.orders.get(codOrderId).cod_settlement_status, "pending");
    assert.strictEqual(db.orders.get(codOrderId).payment_status, "Pending");

    // Doorstep Cash Collection -> updates cod_collection_status without polluting cod_settled_amount
    const collRes = await recordDoorstepCodCollection(
      {
        orderId: codOrderId,
        expectedAmount: 950,
        collectedAmount: 950,
        collectorId: adminId,
        collectionStatus: "collected",
        collectionReference: "POUCH-772",
      },
      { adminDb: db }
    );
    assert.strictEqual(collRes.success, true);
    assert.strictEqual(db.orders.get(codOrderId).cod_collection_status, "collected");
    assert.strictEqual(db.orders.get(codOrderId).cod_collected_amount, 950);
    assert.strictEqual(db.orders.get(codOrderId).is_paid, true);
    assert.strictEqual(db.orders.get(codOrderId).cod_settled_amount, undefined, "Must NOT set cod_settled_amount before courier remittance");

    // Duplicate doorstep collection blocked
    const dupColl = await recordDoorstepCodCollection(
      { orderId: codOrderId, expectedAmount: 950, collectedAmount: 950, collectorId: adminId, collectionStatus: "collected" },
      { adminDb: db }
    );
    assert.strictEqual(dupColl.success, false);

    // Unified courier remittance reconciliation writes cod_remittances & marks reconciled
    const remitRes = await reconcileDelhiveryCODRemittance(
      { orderId: codOrderId, settlementRef: "REMIT-BNK-9911", remittedAmount: 950, adminUserId: adminId },
      { adminDb: db }
    );
    assert.strictEqual(remitRes.success, true);
    assert.strictEqual(remitRes.status, "reconciled");
    assert.strictEqual(db.cod_remittances.length, 1);
    assert.strictEqual(db.orders.get(codOrderId).cod_settlement_status, "reconciled");
    assert.strictEqual(db.orders.get(codOrderId).cod_settled_amount, 950);

    // Re-reconciliation blocked cleanly
    const dupRemit = await reconcileCourierRemittance(
      { remittanceRef: "REMIT-BNK-9912", orderId: codOrderId, expectedAmount: 950, remittedAmount: 950, adminId },
      { adminDb: db }
    );
    assert.strictEqual(dupRemit.success, false);
    assert.strictEqual(dupRemit.status, "duplicate");

    // COD RTO / Undelivered creates ZERO refund records & marks unpaid Returned
    const rtoOrderId = db.nextUuid();
    db.orders.set(rtoOrderId, {
      id: rtoOrderId,
      order_number: "MDS-200102",
      order_status: "Out for Delivery",
      payment_method: "COD",
      payment_status: "Pending",
      is_paid: false,
      cod_collection_status: "uncollected",
      cod_settlement_status: "unsettled",
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_awb: "1490001112299",
      total_amount: 550,
    });
    const rtoWebhook = await processDelhiveryWebhook(
      { waybill: "1490001112299", status: "RTO", StatusDateTime: "2026-11-11T16:00:00Z" },
      { adminDb: db }
    );
    assert.strictEqual(rtoWebhook.status, "updated");
    assert.strictEqual(db.orders.get(rtoOrderId).order_status, "Returned");
    assert.strictEqual(db.orders.get(rtoOrderId).refund_status, "not_required");
    assert.strictEqual(
      Array.from(db.refund_records.values()).filter((r) => r.order_id === rtoOrderId).length,
      0
    );
  });

  await testCase("C7-C10: Pre-collection COD cancellations produce zero refunds; post-collection COD return refunds distinguish pending vs UTR-confirmed completion", async () => {
    const db = new Phase04MockDb();
    const adminId = db.nextUuid();
    const userId = db.nextUuid();
    db.profiles.set(adminId, { id: adminId, role: "admin", is_blocked: false, is_deleted: false });

    // Pre-dispatch COD cancellation -> no refund records, not_required
    const preCodId = db.nextUuid();
    db.orders.set(preCodId, {
      id: preCodId,
      user_id: userId,
      order_status: "Confirmed",
      payment_method: "COD",
      payment_status: "Pending",
      is_paid: false,
      cod_collection_status: "uncollected",
      total_amount: 450,
    });
    const preCancel = await executeOrderCancellation(
      { orderId: preCodId, actorUserId: userId, reason: "Changed mind", isAdmin: false },
      { adminDb: db, sendOrderEmailsFn: async () => ({ success: true }) }
    );
    assert.strictEqual(preCancel.success, true);
    assert.strictEqual(preCancel.refundStatus, "NOT_REQUIRED");
    assert.strictEqual(db.refund_records.size, 0);

    // Dispatched COD cancellation preserves Phase 3 courier-halt rule AND emits zero refunds
    const dispCodId = db.nextUuid();
    db.orders.set(dispCodId, {
      id: dispCodId,
      user_id: userId,
      order_status: "Shipped",
      payment_method: "COD",
      payment_status: "Pending",
      is_paid: false,
      cod_collection_status: "uncollected",
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_awb: "1495556667771",
      total_amount: 800,
    });
    const blockedCancel = await executeDispatchedOrderCancellation(
      { orderId: dispCodId, adminUserId: adminId, reason: "Customer called to cancel" },
      {
        adminDb: db,
        cancelDelhiveryShipmentFn: async () => ({ success: false, awb: "1495556667771", error: "Delhivery API failed" }),
        sendOrderEmailsFn: async () => ({ success: true }),
      }
    );
    assert.strictEqual(blockedCancel.success, false);
    assert.strictEqual(db.orders.get(dispCodId).order_status, "Shipped");

    const okDispCancel = await executeDispatchedOrderCancellation(
      { orderId: dispCodId, adminUserId: adminId, reason: "Verified pickup halt" },
      {
        adminDb: db,
        cancelDelhiveryShipmentFn: async () => ({ success: true, awb: "1495556667771" }),
        sendOrderEmailsFn: async () => ({ success: true }),
      }
    );
    assert.strictEqual(okDispCancel.success, true);
    assert.strictEqual(okDispCancel.refundStatus, "NOT_REQUIRED");
    assert.strictEqual(db.orders.get(dispCodId).order_status, "Cancelled");
    assert.strictEqual(db.refund_records.size, 0);

    // Delivered UNCOLLECTED COD order -> Return refund MUST BE BLOCKED!
    const uncollectedDelId = db.nextUuid();
    const uncollectedRetId = db.nextUuid();
    db.orders.set(uncollectedDelId, {
      id: uncollectedDelId,
      user_id: userId,
      order_status: "Delivered",
      payment_method: "COD",
      payment_status: "Pending",
      is_paid: false,
      cod_collection_status: "uncollected",
      cod_settlement_status: "pending",
      total_amount: 600,
    });
    db.return_requests.set(uncollectedRetId, {
      id: uncollectedRetId,
      order_id: uncollectedDelId,
      return_number: "RET-202611-10001",
      status: "received",
      refund_amount: 600,
      reason: "Misprinted pages",
    });

    const uncollectedRefund = await processReturnRefund(
      { returnId: uncollectedRetId, adminId },
      { adminDb: db }
    );
    assert.strictEqual(uncollectedRefund.success, false);
    assert.match(uncollectedRefund.error || "", /not been confirmed/i);
    assert.strictEqual(db.refund_records.size, 0);

    // Collected COD order -> Step 1: Pending Payout (NO COD-REFUND-* fake ID!), Step 2: Confirm UTR -> Completed!
    const collectedDelId = db.nextUuid();
    const collectedRetId = db.nextUuid();
    db.orders.set(collectedDelId, {
      id: collectedDelId,
      user_id: userId,
      order_status: "Delivered",
      payment_method: "COD",
      payment_status: "Paid",
      is_paid: true,
      cod_collection_status: "collected",
      cod_collected_amount: 1100,
      cod_settlement_status: "pending",
      total_amount: 1100,
    });
    db.return_requests.set(collectedRetId, {
      id: collectedRetId,
      order_id: collectedDelId,
      return_number: "RET-202611-10002",
      status: "received",
      refund_amount: 1100,
      reason: "Wrong edition sent",
    });

    const authCodRefund = await processReturnRefund(
      { returnId: collectedRetId, adminId },
      { adminDb: db }
    );
    assert.strictEqual(authCodRefund.success, true);
    assert.strictEqual(authCodRefund.status, "pending", "COD return refund MUST start as pending payout");
    assert.strictEqual(authCodRefund.payoutRequired, true);
    assert.strictEqual(authCodRefund.gatewayRefundId, undefined, "Never generate synthetic COD-REFUND-* ID");
    assert.strictEqual(db.return_requests.get(collectedRetId).status, "refund_pending");
    assert.strictEqual(db.orders.get(collectedDelId).payment_status, "Refund Pending");

    // Duplicate initiation returns existing pending record cleanly without creating a 2nd record
    const dupInit = await processReturnRefund({ returnId: collectedRetId, adminId }, { adminDb: db });
    assert.strictEqual(dupInit.success, true);
    assert.strictEqual(dupInit.refundRecordId, authCodRefund.refundRecordId);
    assert.strictEqual(db.refund_records.size, 1);

    // Reject synthetic payout confirmation references
    const badConfirm = await confirmCodReturnRefundPayout(
      {
        refundRecordId: authCodRefund.refundRecordId,
        adminId,
        payoutChannel: "cod_bank_transfer",
        payoutReference: "COD-REFUND-99999",
      },
      { adminDb: db }
    );
    assert.strictEqual(badConfirm.success, false);

    // Genuine UTR confirmation settles COD refund completely
    const okConfirm = await confirmCodReturnRefundPayout(
      {
        refundRecordId: authCodRefund.refundRecordId,
        adminId,
        payoutChannel: "cod_upi",
        payoutReference: "UTR631199884422",
        destinationHint: "amina@okicici",
      },
      { adminDb: db }
    );
    assert.strictEqual(okConfirm.success, true);
    assert.strictEqual(okConfirm.payoutReference, "UTR631199884422");
    assert.strictEqual(db.refund_records.get(authCodRefund.refundRecordId!).status, "processed");
    assert.strictEqual(db.return_requests.get(collectedRetId).status, "completed");
    assert.strictEqual(db.orders.get(collectedDelId).payment_status, "Refunded");
    assert.strictEqual(db.orders.get(collectedDelId).cod_refund_reference, "UTR631199884422");
  });

  // --------------------------------------------------------------------------
  // 4. WEBHOOK IDEMPOTENCY, ORDERING & TIMESTAMP PROTECTION
  // --------------------------------------------------------------------------
  await testCase("W1-W4: Delhivery webhooks deduplicate replays, reject stale/out-of-order scans, and handle missing IDs/timestamps safely", async () => {
    const db = new Phase04MockDb();
    const orderId = db.nextUuid();
    db.orders.set(orderId, {
      id: orderId,
      order_number: "MDS-300001",
      order_status: "Confirmed",
      payment_method: "ONLINE",
      payment_status: "Paid",
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_awb: "1497770001112",
      total_amount: 400,
    });

    // Event 1: In Transit @ 10:00 (no event_id -> deterministic SHA-256 fingerprint)
    const evt1Payload = {
      Shipment: {
        AWB: "1497770001112",
        Status: { Status: "In Transit", StatusCode: "IT", StatusDateTime: "2026-11-11T10:00:00Z" },
      },
    };
    const r1 = await processDelhiveryWebhook(evt1Payload, { adminDb: db });
    assert.strictEqual(r1.status, "updated");
    assert.strictEqual(db.orders.get(orderId).order_status, "Shipped");
    assert.strictEqual(db.webhook_events.size, 1);

    // Duplicate replay of exact Event 1 -> deduplicated idempotently
    const r1Dup = await processDelhiveryWebhook(evt1Payload, { adminDb: db });
    assert.strictEqual(r1Dup.status, "duplicate_ignored");
    assert.strictEqual(r1Dup.duplicate, true);
    assert.strictEqual(db.shipment_events.length, 1, "Duplicate replay must not create extra shipment_events");

    // Event 2: Out for Delivery @ 13:00 with explicit event_id
    const r2 = await processDelhiveryWebhook(
      {
        event_id: "dlv_evt_ofd_02",
        waybill: "1497770001112",
        status: "UD",
        StatusDateTime: "2026-11-11T13:00:00Z",
      },
      { adminDb: db }
    );
    assert.strictEqual(r2.status, "updated");
    assert.strictEqual(db.orders.get(orderId).order_status, "Out for Delivery");

    // Delayed out-of-order Event 3: older In Transit @ 11:00 -> stale_event_ignored, never regresses OFD!
    const staleTimestamp = await processDelhiveryWebhook(
      {
        event_id: "dlv_evt_stale_it_03",
        waybill: "1497770001112",
        status: "In Transit",
        StatusDateTime: "2026-11-11T11:00:00Z",
      },
      { adminDb: db }
    );
    assert.strictEqual(staleTimestamp.status, "stale_event_ignored");
    assert.strictEqual(db.orders.get(orderId).order_status, "Out for Delivery");
    assert.ok(db.shipment_events.some((e) => e.event_type === "webhook_stale_ignored"));

    // Untimestamped + missing event_id delivery scan advances Delivered safely
    const r4 = await processDelhiveryWebhook(
      { waybill: "1497770001112", status: "DL", StatusDateTime: "not-a-valid-date" },
      { adminDb: db }
    );
    assert.strictEqual(r4.status, "updated");
    assert.strictEqual(db.orders.get(orderId).order_status, "Delivered");

    // Late Out-for-Delivery with newer or missing timestamp cannot overwrite Delivered!
    const lateOfd = await processDelhiveryWebhook(
      { event_id: "dlv_evt_late_ofd_05", waybill: "1497770001112", status: "Out for Delivery" },
      { adminDb: db }
    );
    assert.strictEqual(lateOfd.status, "stale_event_ignored");
    assert.strictEqual(db.orders.get(orderId).order_status, "Delivered");

    // Deterministic event ID & malformed timestamp helpers behave deterministically
    assert.strictEqual(
      computeDelhiveryWebhookEventId({ event_id: "evt_99" }),
      "delhivery:evt_99"
    );
    assert.strictEqual(parseDelhiveryWebhookTimestamp({ StatusDateTime: "bad" }).malformed, true);
    assert.strictEqual(mapDelhiveryStatusToOrderStatus("", "RT"), "Returned");

    // Failed webhook event can recover and re-run cleanly on retry
    const retryOrderId = db.nextUuid();
    db.orders.set(retryOrderId, {
      id: retryOrderId,
      order_number: "MDS-300002",
      order_status: "Confirmed",
      payment_method: "ONLINE",
      payment_status: "Paid",
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_awb: "1497770002223",
      total_amount: 400,
    });
    db.webhook_events.set("delhivery:retry_evt_1", {
      id: db.nextUuid(),
      event_id: "delhivery:retry_evt_1",
      provider: "Delhivery",
      event_type: "IT",
      status: "failed",
      updated_at: new Date().toISOString(),
    });
    const retryRes = await processDelhiveryWebhook(
      { event_id: "retry_evt_1", waybill: "1497770002223", status: "IT", StatusDateTime: "2026-11-11T10:15:00Z" },
      { adminDb: db }
    );
    assert.strictEqual(retryRes.status, "updated");
    assert.strictEqual(db.webhook_events.get("delhivery:retry_evt_1").status, "completed");

    // Direct booking payload validation guard checks
    assert.strictEqual(
      validateDelhiveryBookingPayload(
        { id: "o1", payment_method: "COD", total_amount: 0, address_snapshot: { full_name: "A", house_no: "1", area: "B", city: "Delhi", state: "DL", pincode: "110025", phone: "9876543210" } },
        [],
        { pickupLocation: "Main" }
      ).valid,
      false
    );

    // Route handler rejects non-object array JSON safely without crashing
    const prevEnv = {
      APP_ENV: process.env.APP_ENV,
      ENABLE_DELHIVERY: process.env.ENABLE_DELHIVERY,
      DELHIVERY_MODE: process.env.DELHIVERY_MODE,
      DELHIVERY_TOKEN: process.env.DELHIVERY_TOKEN,
      DELHIVERY_WEBHOOK_SECRET: process.env.DELHIVERY_WEBHOOK_SECRET,
    };
    try {
      clearPincodeServiceabilityCache();
      process.env.APP_ENV = "staging";
      process.env.ENABLE_DELHIVERY = "true";
      process.env.DELHIVERY_MODE = "sandbox";
      process.env.DELHIVERY_TOKEN = "sandbox-token-xyz";
      process.env.DELHIVERY_WEBHOOK_SECRET = "sandbox-secret-xyz";

      const arrRes = await delhiveryWebhookPost(
        new Request("http://localhost:3000/api/webhooks/delhivery", {
          method: "POST",
          headers: { Authorization: "Token sandbox-secret-xyz" },
          body: "[]",
        })
      );
      assert.strictEqual(arrRes.status, 400);
    } finally {
      restoreEnv(prevEnv);
    }
  });

  // --------------------------------------------------------------------------
  // 5. SQL MIGRATION STRUCTURAL & SECURITY VERIFICATION
  // --------------------------------------------------------------------------
  await testCase("M1: Phase 4 SQL migration contains all triggers, indexes, and locked-down SECURITY DEFINER RPCs", () => {
    const migPath = path.resolve(
      __dirname,
      "../../../supabase/migrations/20261113000001_phase04_delivery_and_returns_hardening.sql"
    );
    const sql = fs.readFileSync(migPath, "utf8");
    const requiredTokens = [
      "validate_return_request_lifecycle",
      "guard_refund_records_integrity",
      "validate_order_state_transitions",
      "initiate_return_refund_atomic",
      "complete_cod_refund_atomic",
      "record_cod_collection_atomic",
      "reconcile_cod_remittance_atomic",
      "apply_delhivery_webhook_atomic",
      "get_payment_report",
      "idx_cod_collections_positive_unique",
      "idx_refund_records_payout_reference",
      "idx_webhook_events_waybill_time",
      "REV-",
      "COD-REFUND-",
    ];
    for (const token of requiredTokens) {
      assert.ok(sql.includes(token), `Migration missing expected Phase 4 guard/symbol: ${token}`);
    }
  });

  console.log(`\n================================================================================`);
  console.log(` PHASE 04 SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`================================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Unhandled Phase 04 test suite error:", err);
  process.exit(1);
});
