/**
 * Phase 05 Offline Verification Suite — Payments, Emails, Invoices & Shipping Fees Hardening
 *
 * Strictly offline & isolated: operates solely on an in-memory transactional DB simulator,
 * stubbed Razorpay/Resend clients, and pure unit checks. Never connects to Supabase,
 * Razorpay, Resend, or Delhivery over the network.
 */

import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  calculateDiscountedUnitPrice,
  calculateLineTotal,
  calculateOrderFees,
  calculateOrderPricing,
  DELIVERY_FEE,
  PLATFORM_FEE,
  roundCurrency,
  toPaise,
} from "../lib/commerce/pricing";
import { BUSINESS_CONFIG } from "../lib/config/business";
import {
  calculateOrderTaxBreakdown,
  checkOrderInvoiceEligibility,
  getGstStateName,
  normalizeStateToGstCode,
  validateIndianGstin,
} from "../lib/commerce/tax";
import { getOrCreateOrderInvoice, getOrderRefundCreditNote } from "../lib/commerce/invoices";
import { validateDelhiveryBookingPayload } from "../lib/integrations/delhivery/service";
import {
  calculateGstinCheckDigit,
  isValidGstStateCode,
  isValidProductionGstin,
} from "../lib/env/shared";
import {
  createRazorpayOrder,
  initiateRazorpayRefund,
  RazorpayDisabledError,
  verifyAndSettlePayment,
} from "../lib/integrations/razorpay/service";
import { processRazorpayWebhook } from "../lib/integrations/razorpay/webhook";
import {
  classifyEmailError,
  isValidEmailAddress,
  sendAdminNewOrderNotification,
  sendOrderEmails,
  sendShipmentNotification,
} from "../lib/integrations/resend/service";
import {
  escapeHtml,
  renderOrderConfirmationHtml,
} from "../lib/integrations/resend/templates";

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

function setupOfflineEnv(overrides: {
  nodeEnv?: string;
  appEnv?: string;
  razorpay?: "disabled" | "mock" | "sandbox";
  emails?: "disabled" | "mock" | "sandbox";
  delhivery?: "disabled" | "mock" | "sandbox";
} = {}) {
  const keys = [
    "NODE_ENV",
    "APP_ENV",
    "NEXT_PUBLIC_APP_ENV",
    "ALLOW_MOCK_SERVICES",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ENABLE_RAZORPAY",
    "NEXT_PUBLIC_ENABLE_RAZORPAY",
    "RAZORPAY_KEY_ID",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "ENABLE_EMAILS",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_SUPPORT",
    "EMAIL_ADMIN_ALERT",
    "ENABLE_DELHIVERY",
    "DELHIVERY_API_URL",
    "DELHIVERY_TOKEN",
    "DELHIVERY_WEBHOOK_SECRET",
    "DELHIVERY_PICKUP_LOCATION",
    "BUSINESS_GSTIN",
    "BUSINESS_STATE_CODE",
    "DELIVERY_OTP_HMAC_SECRET",
  ];
  const snapshot: Record<string, string | undefined> = {};
  for (const k of keys) snapshot[k] = process.env[k];

  Reflect.set(process.env, "NODE_ENV", overrides.nodeEnv || "test");
  process.env.APP_ENV = overrides.appEnv || "local";
  process.env.NEXT_PUBLIC_APP_ENV = process.env.APP_ENV;
  process.env.ALLOW_MOCK_SERVICES = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test_anon_key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_role_key";
  process.env.DELIVERY_OTP_HMAC_SECRET = "local_test_otp_hmac_secret_64_characters_long_1234567890abcdef";
  process.env.BUSINESS_STATE_CODE = "07";
  process.env.BUSINESS_GSTIN = "07AABCU9603R1ZP";

  const rzp = overrides.razorpay || "sandbox";
  if (rzp === "disabled") {
    process.env.ENABLE_RAZORPAY = "false";
    process.env.NEXT_PUBLIC_ENABLE_RAZORPAY = "false";
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  } else if (rzp === "mock") {
    process.env.ENABLE_RAZORPAY = "true";
    process.env.NEXT_PUBLIC_ENABLE_RAZORPAY = "true";
    process.env.RAZORPAY_KEY_ID = "rzp_test_mock_key";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_mock_key";
    process.env.RAZORPAY_KEY_SECRET = "mock_razorpay_secret_value";
    process.env.RAZORPAY_WEBHOOK_SECRET = "mock_razorpay_webhook_secret_value";
  } else {
    process.env.ENABLE_RAZORPAY = "true";
    process.env.NEXT_PUBLIC_ENABLE_RAZORPAY = "true";
    process.env.RAZORPAY_KEY_ID = "rzp_test_sandbox_123456";
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_sandbox_123456";
    process.env.RAZORPAY_KEY_SECRET = "sandbox_rzp_secret_987654321";
    process.env.RAZORPAY_WEBHOOK_SECRET = "sandbox_rzp_webhook_secret_987654";
  }

  const em = overrides.emails || "disabled";
  if (em === "disabled") {
    process.env.ENABLE_EMAILS = "false";
    delete process.env.RESEND_API_KEY;
  } else if (em === "mock") {
    process.env.ENABLE_EMAILS = "true";
    process.env.RESEND_API_KEY = "re_mock_test_key";
    process.env.EMAIL_FROM = "MD Shakib Books <orders@mdshakib.com>";
    process.env.EMAIL_ADMIN_ALERT = "admin@mdshakib.com";
  } else {
    process.env.ENABLE_EMAILS = "true";
    process.env.RESEND_API_KEY = "re_test_sandbox_1234567890abcdef";
    process.env.EMAIL_FROM = "MD Shakib Books <orders@mdshakib.com>";
    process.env.EMAIL_ADMIN_ALERT = "admin@mdshakib.com";
  }

  const dlv = overrides.delhivery || "mock";
  process.env.ENABLE_DELHIVERY = dlv === "disabled" ? "false" : "true";
  process.env.DELHIVERY_API_URL = "https://staging-express.delhivery.com";
  process.env.DELHIVERY_TOKEN = dlv === "mock" ? "mock_delhivery_token" : "staging_token_123";
  process.env.DELHIVERY_WEBHOOK_SECRET = "staging_delhivery_webhook_secret";
  process.env.DELHIVERY_PICKUP_LOCATION = "MD SHAKIB ISLAMIC BOOKS";

  return () => {
    for (const k of keys) {
      if (snapshot[k] === undefined) Reflect.deleteProperty(process.env, k);
      else Reflect.set(process.env, k, snapshot[k]);
    }
  };
}

// ==============================================================================
// IN-MEMORY TRANSACTIONAL DB & POSTGRESQL RPC SIMULATOR (MATCHES 20261114000001)
// ==============================================================================

function sqlIsValidGstin(gstin?: string | null): boolean {
  return validateIndianGstin(gstin).valid && (gstin || "").trim().toUpperCase() !== "07AAAAA0000A1Z5";
}

class Phase05MockDb {
  orders = new Map<string, any>();
  order_items: any[] = [];
  books = new Map<string, any>();
  profiles = new Map<string, any>();
  payments: any[] = [];
  payment_attempts: any[] = [];
  inventory_reservations: any[] = [];
  order_status_history: any[] = [];
  refund_records = new Map<string, any>();
  webhook_events = new Map<string, any>();
  email_logs: any[] = [];
  invoices = new Map<string, any>();
  return_requests = new Map<string, any>();
  private seq = 1;
  private invoiceSeq = 1001;

  nextUuid(prefix = "55555555-0000-4000-8000"): string {
    const hex = (this.seq++).toString(16).padStart(12, "0");
    return `${prefix}-${hex}`;
  }

  client(): any {
    const db = this;
    return {
      from(table: string) {
        const filters: Array<{ op: string; col: string; val: any }> = [];
        let orderCol: string | null = null;
        let orderAsc = true;
        let limitNum: number | null = null;

        const readRows = (): any[] => {
          let rows: any[] = [];
          if (table === "orders") rows = Array.from(db.orders.values());
          else if (table === "order_items") rows = [...db.order_items];
          else if (table === "books") rows = Array.from(db.books.values());
          else if (table === "profiles") rows = Array.from(db.profiles.values());
          else if (table === "payments") rows = [...db.payments];
          else if (table === "payment_attempts") rows = [...db.payment_attempts];
          else if (table === "inventory_reservations") rows = [...db.inventory_reservations];
          else if (table === "refund_records") rows = Array.from(db.refund_records.values());
          else if (table === "webhook_events") rows = Array.from(db.webhook_events.values());
          else if (table === "email_logs") rows = [...db.email_logs];
          else if (table === "invoices") rows = Array.from(db.invoices.values());
          else if (table === "return_requests") rows = Array.from(db.return_requests.values());

          let out = rows.filter((row) =>
            filters.every((f) => {
              if (f.op === "eq") return row[f.col] === f.val;
              if (f.op === "neq") return row[f.col] !== f.val;
              if (f.op === "in") return Array.isArray(f.val) && f.val.includes(row[f.col]);
              return true;
            })
          );

          if (table === "refund_records") {
            out = out.map((r) => ({
              ...r,
              orders: db.orders.get(r.order_id) || null,
            }));
          }

          if (orderCol) {
            out.sort((a, b) => {
              const av = a[orderCol!] ?? "";
              const bv = b[orderCol!] ?? "";
              return orderAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : av > bv ? -1 : av < bv ? 1 : 0;
            });
          }

          if (limitNum !== null) out = out.slice(0, limitNum);
          return out.map((r) => structuredClone(r));
        };

        const q: any = {
          select: (_cols?: string) => q,
          eq(col: string, val: any) {
            filters.push({ op: "eq", col, val });
            return q;
          },
          neq(col: string, val: any) {
            filters.push({ op: "neq", col, val });
            return q;
          },
          in(col: string, val: any[]) {
            filters.push({ op: "in", col, val });
            return q;
          },
          order(col: string, opts?: { ascending?: boolean }) {
            orderCol = col;
            orderAsc = opts?.ascending !== false;
            return q;
          },
          limit(n: number) {
            limitNum = n;
            return q;
          },
          then: (resolve: any, reject: any) =>
            Promise.resolve({ data: readRows(), error: null }).then(resolve, reject),
          maybeSingle: async () => {
            const rows = readRows();
            if (rows.length > 1) {
              return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
            }
            return { data: rows[0] ?? null, error: null };
          },
          single: async () => {
            const rows = readRows();
            if (rows.length !== 1) {
              return { data: null, error: { message: `${table} single() expected 1 row, got ${rows.length}` } };
            }
            return { data: rows[0], error: null };
          },
          insert(payload: any) {
            const items = Array.isArray(payload) ? payload : [payload];
            const inserted: any[] = [];

            for (const item of items) {
              const row = {
                id: item.id || db.nextUuid(),
                created_at: item.created_at || new Date().toISOString(),
                updated_at: item.updated_at || new Date().toISOString(),
                ...item,
              };

              if (table === "webhook_events") {
                if (db.webhook_events.has(row.event_id)) {
                  return {
                    data: null,
                    error: { message: `duplicate key value violates unique constraint webhook_events_event_id_key` },
                    select: () => q,
                    single: async () => ({
                      data: null,
                      error: { message: `duplicate key value violates unique constraint webhook_events_event_id_key` },
                    }),
                  };
                }
                db.webhook_events.set(row.event_id, row);
              } else if (table === "email_logs") {
                if (
                  row.idempotency_key &&
                  db.email_logs.some((e) => e.idempotency_key === row.idempotency_key)
                ) {
                  return {
                    data: null,
                    error: { message: "duplicate key value violates unique constraint idx_email_logs_idempotency_key_unique" },
                    select: () => ({
                      single: async () => ({
                        data: null,
                        error: { message: "duplicate key value violates unique constraint idx_email_logs_idempotency_key_unique" },
                      }),
                    }),
                  };
                }
                db.email_logs.push(row);
              } else if (table === "payments") {
                if (
                  ["Paid", "Partially Refunded", "Refund Pending", "Refunded"].includes(row.status) &&
                  db.payments.some(
                    (p) =>
                      p.order_id === row.order_id &&
                      ["Paid", "Partially Refunded", "Refund Pending", "Refunded"].includes(p.status)
                  )
                ) {
                  return {
                    data: null,
                    error: { message: "duplicate key value violates unique constraint idx_payments_single_settled_per_order" },
                  };
                }
                db.payments.push(row);
              } else if (table === "payment_attempts") {
                db.payment_attempts.push(row);
              }
              inserted.push(structuredClone(row));
            }

            const insertBuilder: any = {
              data: inserted,
              error: null,
              select: () => ({
                single: async () => ({ data: inserted[0] ?? null, error: null }),
              }),
              then: (resolve: any, reject: any) =>
                Promise.resolve({ data: inserted, error: null }).then(resolve, reject),
            };
            return insertBuilder;
          },
          update(patch: any) {
            return {
              eq(col: string, val: any) {
                filters.push({ op: "eq", col, val });
                return applyUpdate();
              },
              neq(col: string, val: any) {
                filters.push({ op: "neq", col, val });
                return applyUpdate();
              },
              then: (resolve: any, reject: any) => applyUpdate().then(resolve, reject),
            };

            function applyUpdate(): any {
              const run = () => {
                const match = (r: any) =>
                  filters.every((f) => {
                    if (f.op === "eq") return r[f.col] === f.val;
                    if (f.op === "neq") return r[f.col] !== f.val;
                    return true;
                  });

                if (table === "webhook_events") {
                  for (const [k, row] of db.webhook_events.entries()) {
                    if (match(row)) db.webhook_events.set(k, { ...row, ...patch });
                  }
                } else if (table === "email_logs") {
                  for (let i = 0; i < db.email_logs.length; i++) {
                    if (match(db.email_logs[i])) {
                      db.email_logs[i] = { ...db.email_logs[i], ...patch };
                    }
                  }
                } else if (table === "orders") {
                  for (const [k, row] of db.orders.entries()) {
                    if (match(row)) db.orders.set(k, { ...row, ...patch });
                  }
                } else if (table === "return_requests") {
                  for (const [k, row] of db.return_requests.entries()) {
                    if (match(row)) db.return_requests.set(k, { ...row, ...patch });
                  }
                }
                return { data: null, error: null };
              };

              const chain: any = {
                eq(col: string, val: any) {
                  filters.push({ op: "eq", col, val });
                  return chain;
                },
                neq(col: string, val: any) {
                  filters.push({ op: "neq", col, val });
                  return chain;
                },
                then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
              };
              return chain;
            }
          },
        };
        return q;
      },

      async rpc(name: string, args: Record<string, any> = {}) {
        if (name === "prepare_payment_attempt_atomic") {
          const ord = db.orders.get(args.p_order_id);
          if (!ord || ord.user_id !== args.p_user_id) {
            return { data: { success: false, error: "Order not found or unauthorized" }, error: null };
          }
          if (ord.payment_method !== "ONLINE" || ord.is_paid || ord.payment_status === "Paid") {
            return { data: { success: false, error: "Order not eligible for online payment" }, error: null };
          }
          const active = db.payments.find(
            (p) => p.order_id === ord.id && p.status === "Pending" && !args.p_force_new_attempt
          );
          if (active) {
            return {
              data: {
                success: true,
                action: "reuse",
                provider_order_id: active.provider_order_id,
                amount: ord.total_amount,
                attempt_number: active.attempt_number || 1,
              },
              error: null,
            };
          }
          const nextNum =
            db.payments.filter((p) => p.order_id === ord.id).length + 1;
          return {
            data: {
              success: true,
              action: "create",
              amount: ord.total_amount,
              attempt_number: nextNum,
            },
            error: null,
          };
        }

        if (name === "settle_payment_atomic") {
          const rzpOrderId = String(args.p_razorpay_order_id || "").trim();
          const rzpPayId = String(args.p_razorpay_payment_id || "").trim();
          const raw = args.p_raw_response || {};
          if (!rzpOrderId || !rzpPayId) {
            return { data: { success: false, status: "invalid_params" }, error: null };
          }

          const entityStatus = String(
            raw?.status || raw?.payment?.entity?.status || raw?.payment?.status || raw?.payload?.payment?.entity?.status || ""
          )
            .trim()
            .toLowerCase();
          if (entityStatus && entityStatus !== "captured") {
            return {
              data: {
                success: false,
                status: "payment_not_captured",
                message: `Payment status "${entityStatus}" is not captured.`,
              },
              error: null,
            };
          }

          const order =
            Array.from(db.orders.values()).find((o) => o.razorpay_order_id === rzpOrderId) ||
            (() => {
              const p = db.payments.find((x) => x.provider_order_id === rzpOrderId);
              return p ? db.orders.get(p.order_id) : undefined;
            })();

          if (!order) {
            return { data: { success: false, status: "order_not_found", message: "Order not found" }, error: null };
          }
          if (order.payment_method === "COD") {
            return { data: { success: false, status: "invalid_payment_method", message: "COD rejected" }, error: null };
          }

          // Cross-order payment uniqueness check (20261114000001)
          const conflictingOrder = Array.from(db.orders.values()).find(
            (o) => o.razorpay_payment_id === rzpPayId && o.id !== order.id
          );
          if (conflictingOrder) {
            return {
              data: {
                success: false,
                status: "payment_id_conflict_cross_order",
                message: `Payment ${rzpPayId} already belongs to order ${conflictingOrder.id}`,
              },
              error: null,
            };
          }

          const payment = db.payments.find((p) => p.provider_order_id === rzpOrderId);
          if (!payment) {
            return { data: { success: false, status: "payment_record_not_found", message: "No payment row" }, error: null };
          }

          const currency = String(
            raw?.currency ||
              raw?.payment?.entity?.currency ||
              raw?.order?.entity?.currency ||
              ""
          ).toUpperCase();
          if (currency !== "INR") {
            return { data: { success: false, status: "currency_mismatch", message: "Currency must be INR" }, error: null };
          }

          let rawAmt = Number(
            raw?.amount ?? raw?.payment?.entity?.amount ?? raw?.order?.entity?.amount ?? 0
          );
          if (rawAmt > order.total_amount * 10) rawAmt = rawAmt / 100;
          if (Math.abs(rawAmt - Number(order.total_amount)) > 0.01) {
            return { data: { success: false, status: "amount_mismatch", message: "Amount mismatch" }, error: null };
          }

          if (order.razorpay_payment_id && order.razorpay_payment_id !== rzpPayId) {
            payment.provider_payment_id = rzpPayId;
            payment.status = "Paid";
            return {
              data: {
                success: false,
                status: "payment_id_conflict",
                order_id: order.id,
                requires_refund: true,
                message: "Duplicate capture for already-paid order",
              },
              error: null,
            };
          }

          if (order.is_paid || order.payment_status === "Paid") {
            return {
              data: {
                success: true,
                status: "already_paid",
                order_id: order.id,
                user_id: order.user_id,
                settled: false,
              },
              error: null,
            };
          }

          if (order.order_status !== "Pending") {
            payment.provider_payment_id = rzpPayId;
            payment.status = "Paid";
            order.payment_status = "Paid";
            order.is_paid = true;
            order.razorpay_payment_id = rzpPayId;
            order.refund_status = "pending";
            order.refund_amount = order.total_amount;
            const recId = db.nextUuid();
            db.refund_records.set(recId, {
              id: recId,
              order_id: order.id,
              amount: order.total_amount,
              currency: "INR",
              status: "pending",
              refund_type: "cancellation",
              idempotency_key: `refund:late_capture:${order.id}:${rzpPayId}`,
              attempt_count: 1,
              created_at: new Date().toISOString(),
            });
            return {
              data: {
                success: false,
                status: "cancelled_non_recoverable",
                order_id: order.id,
                settled: false,
                requires_refund: true,
                message: "Late capture on cancelled order; refund required",
              },
              error: null,
            };
          }

          // Check single settled payment per order index
          const otherSettled = db.payments.find(
            (p) =>
              p.order_id === order.id &&
              p.id !== payment.id &&
              ["Paid", "Partially Refunded", "Refund Pending", "Refunded"].includes(p.status)
          );
          if (otherSettled) {
            return {
              data: null,
              error: { message: "duplicate key value violates unique constraint idx_payments_single_settled_per_order" },
            };
          }

          order.payment_status = "Paid";
          order.order_status = "Confirmed";
          order.is_paid = true;
          order.paid_at = new Date().toISOString();
          order.razorpay_order_id = rzpOrderId;
          order.razorpay_payment_id = rzpPayId;

          payment.provider_payment_id = rzpPayId;
          payment.signature = args.p_signature || "";
          payment.status = "Paid";
          payment.raw_response = raw;

          for (const res of db.inventory_reservations) {
            if (res.order_id === order.id && res.status === "reserved") {
              res.status = "committed";
              res.expires_at = null;
            }
          }

          return {
            data: {
              success: true,
              status: "settled",
              order_id: order.id,
              user_id: order.user_id,
              settled: true,
            },
            error: null,
          };
        }

        if (name === "record_payment_failure_atomic") {
          const rzpOrderId = String(args.p_razorpay_order_id || "").trim();
          const order = Array.from(db.orders.values()).find((o) => o.razorpay_order_id === rzpOrderId);
          if (order && (order.is_paid || ["Paid", "Partially Refunded", "Refund Pending", "Refunded"].includes(order.payment_status))) {
            return { data: { success: false, status: "ignored_already_paid", order_id: order.id }, error: null };
          }
          const payment = db.payments.find((p) => p.provider_order_id === rzpOrderId);
          if (payment && !["Paid", "Refunded"].includes(payment.status)) {
            payment.status = "Failed";
          }
          if (order) {
            order.payment_status = "Failed";
            order.order_status = "Cancelled";
            order.cancel_reason = "Payment failed";
          }
          return { data: { success: true, status: "recorded_failure", order_id: order?.id }, error: null };
        }

        if (name === "record_refund_atomic") {
          const order = db.orders.get(args.p_order_id);
          if (!order) return { data: null, error: { message: "Order not found" } };
          const status = args.p_refund_status || "processed";
          const amount = Number(args.p_refund_amount || 0);
          const cleanRefundId =
            args.p_refund_id && !String(args.p_refund_id).startsWith("rfnd_err_")
              ? String(args.p_refund_id).trim()
              : null;

          if (["processing", "processed"].includes(status) && !cleanRefundId) {
            return { data: null, error: { message: "Real gateway refund ID required" } };
          }

          let rec: any = null;
          if (args.p_refund_record_id) {
            rec = db.refund_records.get(args.p_refund_record_id) || null;
          } else if (cleanRefundId) {
            rec = Array.from(db.refund_records.values()).find((r) => r.gateway_refund_id === cleanRefundId) || null;
          }
          if (!rec && args.p_idempotency_key) {
            rec = Array.from(db.refund_records.values()).find((r) => r.idempotency_key === args.p_idempotency_key) || null;
          }

          if (rec && rec.status === "processed") {
            if (status === "processed") {
              return {
                data: {
                  success: true,
                  status: "already_processed",
                  order_id: order.id,
                  refund_id: rec.gateway_refund_id || cleanRefundId,
                  refund_record_id: rec.id,
                },
                error: null,
              };
            }
            return {
              data: {
                success: false,
                status: "cannot_downgrade_processed_refund",
                message: `Cannot downgrade processed refund to ${status}`,
              },
              error: null,
            };
          }

          const priorSettled = Array.from(db.refund_records.values())
            .filter((r) => r.order_id === order.id && r.status === "processed" && (!rec || r.id !== rec.id))
            .reduce((s, r) => s + Number(r.amount || 0), 0);

          if (["pending", "processing", "processed"].includes(status) && priorSettled + amount > Number(order.total_amount) + 0.01) {
            return {
              data: null,
              error: { message: `Cumulative refund ${priorSettled + amount} exceeds order total ${order.total_amount}` },
            };
          }

          if (rec) {
            rec.gateway_refund_id = cleanRefundId || rec.gateway_refund_id;
            rec.amount = amount;
            rec.status = status;
            rec.gateway_status = status;
            rec.attempt_count = ["pending", "processing", "failed"].includes(status)
              ? Number(rec.attempt_count || 1) + 1
              : Number(rec.attempt_count || 1);
            rec.error_message = ["failed", "pending"].includes(status) ? args.p_error_message || rec.error_message : null;
            if (status === "processed" && !rec.processed_at) rec.processed_at = new Date().toISOString();
          } else {
            const newId = db.nextUuid();
            rec = {
              id: newId,
              order_id: order.id,
              gateway_refund_id: cleanRefundId,
              amount,
              currency: "INR",
              status,
              gateway_status: status,
              reason: args.p_reason || "Order refund",
              refund_type: args.p_refund_type || "cancellation",
              idempotency_key: args.p_idempotency_key || null,
              error_message: ["failed", "pending"].includes(status) ? args.p_error_message || null : null,
              attempt_count: 1,
              processed_at: status === "processed" ? new Date().toISOString() : null,
              created_at: new Date().toISOString(),
            };
            db.refund_records.set(newId, rec);
          }

          const effectiveSettled = status === "processed" ? roundCurrency(priorSettled + amount) : priorSettled;
          const nextPaymentStatus =
            status === "processed"
              ? effectiveSettled >= Number(order.total_amount) - 0.01
                ? "Refunded"
                : "Partially Refunded"
              : ["pending", "processing"].includes(status)
              ? "Refund Pending"
              : priorSettled > 0
              ? "Partially Refunded"
              : "Paid";

          order.payment_status = nextPaymentStatus;
          if (cleanRefundId) order.razorpay_refund_id = cleanRefundId;
          order.refund_status = status;
          order.refund_amount =
            effectiveSettled > 0 ? effectiveSettled : status === "failed" ? null : amount;

          const pmt = db.payments.find((p) => p.order_id === order.id && p.status !== "Failed");
          if (pmt) {
            pmt.status = nextPaymentStatus;
            pmt.refund_amount = order.refund_amount;
            pmt.refund_status = status;
            if (cleanRefundId) pmt.refund_id = cleanRefundId;
          }

          return {
            data: {
              success: true,
              status,
              order_id: order.id,
              refund_id: cleanRefundId,
              refund_record_id: rec.id,
              payment_status: nextPaymentStatus,
              cumulative_refunded: effectiveSettled,
            },
            error: null,
          };
        }

        if (name === "generate_order_invoice_atomic") {
          const sellerGstin = String(args.p_seller_gstin || "").trim().toUpperCase();
          const customerGstin = args.p_customer_gstin
            ? String(args.p_customer_gstin).trim().toUpperCase()
            : null;
          if (!sqlIsValidGstin(sellerGstin)) {
            return {
              data: {
                success: false,
                error_code: "INVALID_SELLER_GSTIN",
                error: "Invalid seller GSTIN.",
              },
              error: null,
            };
          }
          if (customerGstin && !sqlIsValidGstin(customerGstin)) {
            return {
              data: {
                success: false,
                error_code: "INVALID_CUSTOMER_GSTIN",
                error: "Invalid customer GSTIN.",
              },
              error: null,
            };
          }
          const order = db.orders.get(args.p_order_id);
          if (!order) {
            return { data: { success: false, error_code: "ORDER_NOT_FOUND", error: "Order not found" }, error: null };
          }
          const existing = db.invoices.get(order.id);
          if (existing) {
            return {
              data: {
                success: true,
                invoice_id: existing.id,
                invoice_number: existing.invoice_number,
                already_existed: true,
              },
              error: null,
            };
          }
          const elig = checkOrderInvoiceEligibility(order);
          if (!elig.eligible) {
            return {
              data: { success: false, error_code: elig.errorCode, error: elig.reason },
              error: null,
            };
          }
          const invNum = `INV-202611-${String(db.invoiceSeq++).padStart(5, "0")}`;
          const items = db.order_items
            .filter((i) => i.order_id === order.id)
            .map((i) => ({
              book_id: i.book_id,
              title: i.title,
              quantity: i.quantity,
              unit_price: i.price,
              total_price: roundCurrency(i.price * i.quantity),
            }));
          const subtotal = Number(order.subtotal ?? order.total_amount);
          const discount = Number(order.discount_amount ?? 0);
          const shipping = Number(order.delivery_fee ?? 0);
          const platformFee = Number(order.platform_fee ?? 0);
          const tax = calculateOrderTaxBreakdown({
            subtotal,
            discount,
            shippingFee: shipping,
            platformFee,
            stateCode: order.address_snapshot?.state,
            pincode: order.address_snapshot?.pincode,
            sellerGstin,
          });
          const inv = {
            id: db.nextUuid(),
            order_id: order.id,
            invoice_number: invNum,
            invoice_date: new Date().toISOString(),
            customer_id: order.user_id,
            billing_name: order.address_snapshot?.full_name || "Customer",
            billing_address: order.address_snapshot || {},
            shipping_address: order.address_snapshot || {},
            items_snapshot: items,
            subtotal,
            discount_amount: discount,
            taxable_value: tax.taxableValue,
            platform_fee: platformFee,
            cgst_rate: tax.cgstRate,
            cgst_amount: tax.cgstAmount,
            sgst_rate: tax.sgstRate,
            sgst_amount: tax.sgstAmount,
            igst_rate: tax.igstRate,
            igst_amount: tax.igstAmount,
            shipping_charges: shipping,
            grand_total: Number(order.total_amount),
            payment_method: order.payment_method,
            payment_status: order.payment_status,
            payment_reference: order.razorpay_payment_id || order.cod_settlement_ref || null,
            seller_gstin: sellerGstin,
            customer_gstin: customerGstin || order.customer_gstin || null,
            seller_state_code: tax.sellerStateCode,
            place_of_supply_code: tax.placeOfSupplyCode,
          };
          db.invoices.set(order.id, inv);
          return {
            data: {
              success: true,
              invoice_id: inv.id,
              invoice_number: invNum,
              grand_total: inv.grand_total,
            },
            error: null,
          };
        }

        return { data: null, error: { message: `Unhandled RPC: ${name}` } };
      },
    };
  }
}

function seedOnlineOrder(db: Phase05MockDb, opts: {
  userId?: string;
  orderStatus?: string;
  paymentStatus?: string;
  isPaid?: boolean;
  totalAmount?: number;
  subtotal?: number;
  deliveryFee?: number;
  platformFee?: number;
  discountAmount?: number;
  state?: string;
  pincode?: string;
  customerName?: string;
  rzpOrderId?: string;
  rzpPaymentId?: string;
  emailNotificationsEnabled?: boolean;
  email?: string;
  isDeleted?: boolean;
} = {}) {
  const userId = opts.userId || db.nextUuid();
  const orderId = db.nextUuid();
  const rzpOrderId = opts.rzpOrderId || `rzp_ord_${orderId.slice(-8)}`;
  const totalAmount = opts.totalAmount ?? 945;
  const subtotal = opts.subtotal ?? 900;
  const deliveryFee = opts.deliveryFee ?? 35;
  const platformFee = opts.platformFee ?? 10;

  db.profiles.set(userId, {
    id: userId,
    name: opts.customerName || "Amina Tariq",
    email: opts.email !== undefined ? opts.email : `cust_${userId.slice(-6)}@example.com`,
    email_notifications_enabled: opts.emailNotificationsEnabled ?? true,
    is_deleted: opts.isDeleted ?? false,
    role: "user",
  });

  db.orders.set(orderId, {
    id: orderId,
    order_number: `MDS-${orderId.slice(-6).toUpperCase()}`,
    user_id: userId,
    order_status: opts.orderStatus || "Pending",
    payment_method: "ONLINE",
    payment_status: opts.paymentStatus || "Pending",
    is_paid: opts.isPaid ?? false,
    total_amount: totalAmount,
    subtotal,
    delivery_fee: deliveryFee,
    platform_fee: platformFee,
    discount_amount: opts.discountAmount ?? 0,
    razorpay_order_id: rzpOrderId,
    razorpay_payment_id: opts.rzpPaymentId || null,
    refund_status: "not_required",
    refund_amount: null,
    created_at: new Date().toISOString(),
    address_snapshot: {
      full_name: opts.customerName || "Amina Tariq",
      phone: "9876543210",
      house_no: "14B",
      area: "Jamia Nagar",
      city: opts.state === "Maharashtra" ? "Mumbai" : "New Delhi",
      state: opts.state || "Delhi",
      pincode: opts.pincode || "110025",
    },
  });

  const bookId = db.nextUuid();
  db.order_items.push({
    id: db.nextUuid(),
    order_id: orderId,
    book_id: bookId,
    title: "Sahih Al-Bukhari Arabic-English",
    price: subtotal,
    quantity: 1,
  });

  db.inventory_reservations.push({
    id: db.nextUuid(),
    order_id: orderId,
    book_id: bookId,
    quantity: 1,
    status: opts.isPaid ? "committed" : "reserved",
  });

  db.payments.push({
    id: db.nextUuid(),
    order_id: orderId,
    user_id: userId,
    payment_id: rzpOrderId,
    provider_order_id: rzpOrderId,
    provider_payment_id: opts.rzpPaymentId || null,
    amount: totalAmount,
    currency: "INR",
    provider: "Razorpay",
    status: opts.isPaid ? "Paid" : "Pending",
  });

  return { userId, orderId, rzpOrderId };
}

function signRzp(orderId: string, paymentId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function signWebhook(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ==============================================================================
// RUN PHASE 05 TEST SUITE
// ==============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("PHASE 05 OFFLINE HARDENING VERIFICATION SUITE");
  console.log("=".repeat(80) + "\n");

  // ---------------------------------------------------------------------------
  // A. RAZORPAY PAYMENT SETTLEMENT & FAIL-CLOSED VERIFICATION
  // ---------------------------------------------------------------------------

  await testCase("RZP-01: Fail-closed — verifyAndSettlePayment rejects settlement when client.payments.fetch fails in live/sandbox", async () => {
    const restore = setupOfflineEnv({ razorpay: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const { userId, orderId, rzpOrderId } = seedOnlineOrder(db);
      const adminDb = db.client();
      const sig = signRzp(rzpOrderId, "pay_fetch_err_1", process.env.RAZORPAY_KEY_SECRET!);

      const failingClient = {
        payments: {
          fetch: async () => {
            throw new Error("ETIMEDOUT reading payments.fetch");
          },
        },
      };

      await assert.rejects(
        () =>
          verifyAndSettlePayment(
            {
              razorpay_order_id: rzpOrderId,
              razorpay_payment_id: "pay_fetch_err_1",
              razorpay_signature: sig,
              userId,
            },
            { adminDb, razorpayClient: failingClient }
          ),
        /Authoritative Razorpay payment verification failed/
      );

      assert.equal(db.orders.get(orderId)!.payment_status, "Pending");
      assert.equal(db.orders.get(orderId)!.is_paid, false);
    } finally {
      restore();
    }
  });

  await testCase("RZP-02: verifyAndSettlePayment rejects uncaptured ('authorized'), mismatched order/id, wrong currency, and wrong amount", async () => {
    const restore = setupOfflineEnv({ razorpay: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const { userId, orderId, rzpOrderId } = seedOnlineOrder(db, { totalAmount: 945 });
      const adminDb = db.client();
      const sig = signRzp(rzpOrderId, "pay_bad_state", process.env.RAZORPAY_KEY_SECRET!);

      const badStates = [
        { id: "pay_bad_state", order_id: rzpOrderId, status: "authorized", currency: "INR", amount: 94500 },
        { id: "pay_other_id", order_id: rzpOrderId, status: "captured", currency: "INR", amount: 94500 },
        { id: "pay_bad_state", order_id: "rzp_ord_OTHER", status: "captured", currency: "INR", amount: 94500 },
        { id: "pay_bad_state", order_id: rzpOrderId, status: "captured", currency: "USD", amount: 94500 },
        { id: "pay_bad_state", order_id: rzpOrderId, status: "captured", currency: "INR", amount: 94400 },
      ];

      for (const payload of badStates) {
        await assert.rejects(() =>
          verifyAndSettlePayment(
            {
              razorpay_order_id: rzpOrderId,
              razorpay_payment_id: "pay_bad_state",
              razorpay_signature: sig,
              userId,
            },
            {
              adminDb,
              razorpayClient: { payments: { fetch: async () => payload } },
            }
          )
        );
      }

      assert.equal(db.orders.get(orderId)!.payment_status, "Pending");

      // Valid captured payment settles cleanly
      const ok = await verifyAndSettlePayment(
        {
          razorpay_order_id: rzpOrderId,
          razorpay_payment_id: "pay_bad_state",
          razorpay_signature: sig,
          userId,
        },
        {
          adminDb,
          razorpayClient: {
            payments: {
              fetch: async () => ({
                id: "pay_bad_state",
                order_id: rzpOrderId,
                status: "captured",
                currency: "INR",
                amount: 94500,
              }),
            },
          },
        }
      );

      assert.equal(ok.success, true);
      assert.equal(ok.alreadySettled, false);
      assert.equal(db.orders.get(orderId)!.payment_status, "Paid");
      assert.equal(db.orders.get(orderId)!.order_status, "Confirmed");
    } finally {
      restore();
    }
  });

  await testCase("RZP-03: Single payment ID cannot settle two different orders & kill switch fails closed", async () => {
    const restore = setupOfflineEnv({ razorpay: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const o1 = seedOnlineOrder(db, { rzpOrderId: "rzp_ord_A" });
      const o2 = seedOnlineOrder(db, { rzpOrderId: "rzp_ord_B" });
      const adminDb = db.client();

      const settle1 = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_A",
        p_razorpay_payment_id: "pay_unique_1",
        p_raw_response: { status: "captured", currency: "INR", amount: 94500 },
      });
      assert.equal(settle1.data.success, true);

      const settle2 = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_B",
        p_razorpay_payment_id: "pay_unique_1",
        p_raw_response: { status: "captured", currency: "INR", amount: 94500 },
      });
      assert.equal(settle2.data.success, false);
      assert.equal(settle2.data.status, "payment_id_conflict_cross_order");
      assert.equal(db.orders.get(o2.orderId)!.payment_status, "Pending");

      process.env.ENABLE_RAZORPAY = "false";
      await assert.rejects(() => createRazorpayOrder(o1.orderId, o1.userId, { adminDb }), RazorpayDisabledError);
    } finally {
      restore();
    }
  });

  await testCase("RZP-04: Webhook in-flight duplicate check & terminal webhook_events status across all branches", async () => {
    const restore = setupOfflineEnv({ razorpay: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const { orderId, rzpOrderId } = seedOnlineOrder(db);
      const adminDb = db.client();
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

      // 1. Pre-seeded processing event returns in_flight_duplicate (no concurrent double run)
      db.webhook_events.set("evt_in_flight", {
        id: db.nextUuid(),
        event_id: "evt_in_flight",
        provider: "Razorpay",
        event_type: "payment.captured",
        status: "processing",
      });
      const inFlightBody = JSON.stringify({
        id: "evt_in_flight",
        event: "payment.captured",
        payload: {
          payment: {
            entity: { id: "pay_flight", order_id: rzpOrderId, status: "captured", currency: "INR", amount: 94500 },
          },
        },
      });
      const flightRes = await processRazorpayWebhook(inFlightBody, signWebhook(inFlightBody, secret), { adminDb });
      assert.equal(flightRes.status, "in_flight_duplicate");
      assert.equal(db.orders.get(orderId)!.payment_status, "Pending");

      // 2. Authorized-only webhook rejected AND event finalized as completed (not stuck in 'processing')
      const authBody = JSON.stringify({
        id: "evt_auth_only",
        event: "payment.captured",
        payload: {
          payment: {
            entity: { id: "pay_auth", order_id: rzpOrderId, status: "authorized", currency: "INR", amount: 94500 },
          },
        },
      });
      const authRes = await processRazorpayWebhook(authBody, signWebhook(authBody, secret), { adminDb });
      assert.equal(authRes.status, "rejected");
      assert.equal(db.webhook_events.get("evt_auth_only")!.status, "completed");

      // 3. Unhandled event type finalized cleanly
      const unhandledBody = JSON.stringify({ id: "evt_unknown_1", event: "subscription.activated", payload: {} });
      const unhandledRes = await processRazorpayWebhook(unhandledBody, signWebhook(unhandledBody, secret), { adminDb });
      assert.equal(unhandledRes.status, "unhandled_event");
      assert.equal(db.webhook_events.get("evt_unknown_1")!.status, "completed");

      // 4. Non-object JSON rejected
      await assert.rejects(
        () => processRazorpayWebhook("[]", signWebhook("[]", secret), { adminDb }),
        /expected JSON object/
      );

      // 5. Previously failed webhook retries cleanly to completion
      db.webhook_events.set("evt_retry_ok", {
        id: db.nextUuid(),
        event_id: "evt_retry_ok",
        provider: "Razorpay",
        event_type: "payment.captured",
        status: "failed",
      });
      const capBody = JSON.stringify({
        id: "evt_retry_ok",
        event: "payment.captured",
        payload: {
          payment: {
            entity: { id: "pay_ok_1", order_id: rzpOrderId, status: "captured", currency: "INR", amount: 94500 },
          },
        },
      });
      const retryRes = await processRazorpayWebhook(capBody, signWebhook(capBody, secret), { adminDb });
      assert.equal(retryRes.status, "settled");
      assert.equal(db.webhook_events.get("evt_retry_ok")!.status, "completed");

      // 6. Replay returns idempotent_ok
      const replayRes = await processRazorpayWebhook(capBody, signWebhook(capBody, secret), { adminDb });
      assert.equal(replayRes.status, "idempotent_ok");
    } finally {
      restore();
    }
  });

  // ---------------------------------------------------------------------------
  // B. REFUNDS & PARTIAL / UNCERTAIN RECONCILIATION
  // ---------------------------------------------------------------------------

  await testCase("RZP-05: Partial refunds track cumulative cap, active in-flight duplicate check prevents double partial refund, and failed refunds never set refund_amount", async () => {
    const restore = setupOfflineEnv({ razorpay: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const { orderId, rzpOrderId } = seedOnlineOrder(db, {
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        totalAmount: 945,
        rzpPaymentId: "pay_partial_1",
      });
      const adminDb = db.client();
      let refundCalls = 0;

      const partialClient = {
        payments: {
          fetch: async () => ({
            id: "pay_partial_1",
            order_id: rzpOrderId,
            status: "captured",
            currency: "INR",
            amount: 94500,
            amount_refunded: refundCalls >= 1 ? 40000 : 0,
          }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async (_pid: string, body: any) => {
            refundCalls++;
            if (refundCalls === 2) {
              // Second partial refund starts as pending (async gateway settlement)
              return { id: "rfnd_part_2", status: "pending", currency: "INR", amount: body.amount };
            }
            return { id: "rfnd_part_1", status: "processed", currency: "INR", amount: body.amount };
          },
        },
        refunds: {
          fetch: async (rid: string) => ({ id: rid, status: "pending", amount: 30000, currency: "INR" }),
        },
      };

      // Partial refund #1 (₹400 processed)
      const r1 = await initiateRazorpayRefund(
        { orderId, amount: 400, idempotencyKey: "refund:partial:1", refundType: "return" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(r1.success, true);
      assert.equal(r1.status, "processed");
      assert.equal(db.orders.get(orderId)!.payment_status, "Partially Refunded");
      assert.equal(db.orders.get(orderId)!.refund_amount, 400);

      // Partial refund #2 (₹300 enters processing)
      const r2 = await initiateRazorpayRefund(
        { orderId, amount: 300, idempotencyKey: "refund:partial:2", refundType: "return" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(r2.success, true);
      assert.equal(r2.status, "processing");
      assert.equal(refundCalls, 2);

      // Re-invoking partial refund #2 while processing polls gateway instead of calling payments.refund a 3rd time!
      const r2Replay = await initiateRazorpayRefund(
        { orderId, amount: 300, idempotencyKey: "refund:partial:2", refundType: "return" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(r2Replay.success, true);
      assert.equal(r2Replay.refundId, "rfnd_part_2");
      assert.equal(refundCalls, 2, "Must NEVER double-call payments.refund while active partial refund exists");

      // Attempting a ₹500 3rd refund exceeds remaining refundable balance (945 - 400 - 300 = 245)
      const overCap = await initiateRazorpayRefund(
        { orderId, amount: 500, idempotencyKey: "refund:partial:over" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(overCap.success, false);
      assert.equal(overCap.status, "not_eligible");

      // Failed refund attempt on fresh paid order never sets orders.refund_amount > 0
      const fresh = seedOnlineOrder(db, {
        orderStatus: "Cancelled",
        paymentStatus: "Paid",
        isPaid: true,
        totalAmount: 500,
        rzpPaymentId: "pay_fail_rfnd",
      });
      const failClient = {
        payments: {
          fetch: async () => ({
            id: "pay_fail_rfnd",
            order_id: fresh.rzpOrderId,
            status: "captured",
            currency: "INR",
            amount: 50000,
            amount_refunded: 0,
          }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async () => {
            throw new Error("Razorpay gateway rejected refund");
          },
        },
      };
      const failRes = await initiateRazorpayRefund(
        { orderId: fresh.orderId, idempotencyKey: "refund:fail:test" },
        { adminDb, razorpayClient: failClient }
      );
      assert.equal(failRes.success, false);
      assert.equal(db.orders.get(fresh.orderId)!.refund_status, "failed");
      assert.equal(db.orders.get(fresh.orderId)!.refund_amount, null, "Failed refund must leave refund_amount NULL");
      assert.equal(db.orders.get(fresh.orderId)!.payment_status, "Paid");
    } finally {
      restore();
    }
  });

  await testCase("RZP-06: Timeout during payments.refund recovers existing remote refund via fetchMultipleRefund without duplicating", async () => {
    const restore = setupOfflineEnv({ razorpay: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const { orderId, rzpOrderId } = seedOnlineOrder(db, {
        orderStatus: "Cancelled",
        paymentStatus: "Paid",
        isPaid: true,
        totalAmount: 600,
        rzpPaymentId: "pay_timeout_rec",
      });
      const adminDb = db.client();
      const idemKey = `refund:cancel:${orderId}`;
      const receipt = `rcpt_${crypto.createHash("sha256").update(idemKey).digest("hex").slice(0, 32)}`;

      const timeoutRecoverClient = {
        payments: {
          fetch: async () => ({
            id: "pay_timeout_rec",
            order_id: rzpOrderId,
            status: "captured",
            currency: "INR",
            amount: 60000,
            amount_refunded: 0,
          }),
          fetchMultipleRefund: (() => {
            let calls = 0;
            return async () => {
              calls++;
              // 1st call (preflight before refund): empty; 2nd call (catch recovery after timeout): gateway had created it!
              if (calls === 1) return { items: [] };
              return { items: [{ id: "rfnd_recovered_timeout", status: "processed", amount: 60000, receipt }] };
            };
          })(),
          refund: async () => new Promise((r) => setTimeout(() => r({ id: "late" }), 80)),
        },
      };

      const res = await initiateRazorpayRefund(
        { orderId, idempotencyKey: idemKey },
        { adminDb, razorpayClient: timeoutRecoverClient, timeoutMs: 15 }
      );
      assert.equal(res.success, true);
      assert.equal(res.refundId, "rfnd_recovered_timeout");
      assert.equal(res.status, "processed");
      assert.equal(db.orders.get(orderId)!.payment_status, "Refunded");
    } finally {
      restore();
    }
  });

  // ---------------------------------------------------------------------------
  // C. TRANSACTIONAL EMAIL HARDENING (DEDUP, SUPPRESSION, RETRIES, FEES)
  // ---------------------------------------------------------------------------

  await testCase("EMAIL-01: sendOrderEmails deduplicates sent logs, does NOT permanently block retry of prior failed logs, and classifies transient vs permanent errors", async () => {
    const restore = setupOfflineEnv({ emails: "sandbox" });
    try {
      const db = new Phase05MockDb();
      const { userId, orderId } = seedOnlineOrder(db, {
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
      });
      const adminDb = db.client();

      // 1. Transient 503 x2 followed by success on attempt 3
      let sendAttempts = 0;
      const flakyClient = {
        emails: {
          send: async () => {
            sendAttempts++;
            if (sendAttempts < 3) {
              return { data: null, error: { message: "Resend 503 service unavailable", statusCode: 503 } };
            }
            return { data: { id: "msg_recovered_3" }, error: null };
          },
        },
      };

      const res1 = await sendOrderEmails(
        { orderId, userId, eventType: "order_confirmation" },
        { adminDb, resendClient: flakyClient, maxAttempts: 3, retryBaseDelayMs: 0 }
      );
      assert.equal(res1.success, true);
      assert.equal(res1.attempts, 3);
      assert.equal(res1.messageId, "msg_recovered_3");
      assert.equal(sendAttempts, 3);

      // 2. Duplicate call after 'sent' skips provider send cleanly
      const dupRes = await sendOrderEmails(
        { orderId, userId, eventType: "order_confirmation" },
        { adminDb, resendClient: flakyClient, maxAttempts: 3, retryBaseDelayMs: 0 }
      );
      assert.equal(dupRes.success, true);
      assert.equal(dupRes.alreadySent, true);
      assert.equal(sendAttempts, 3, "Must NOT re-send after status=sent");

      // 3. Admin notification fails transiently when maxAttempts=1, then later retry succeeds (bug fix: old code blocked any existing log without status='sent')
      let adminAttempts = 0;
      const adminFlakyClient = {
        emails: {
          send: async () => {
            adminAttempts++;
            if (adminAttempts === 1) {
              return { data: null, error: { message: "429 too many requests", statusCode: 429 } };
            }
            return { data: { id: "msg_admin_ok" }, error: null };
          },
        },
      };

      const adminFail = await sendAdminNewOrderNotification(orderId, {
        adminDb,
        resendClient: adminFlakyClient,
        maxAttempts: 1,
        retryBaseDelayMs: 0,
      });
      assert.equal(adminFail.success, false);
      assert.equal(adminFail.failureType, "transient");
      assert.equal(adminFail.retryable, true);

      const adminRetryOk = await sendAdminNewOrderNotification(orderId, {
        adminDb,
        resendClient: adminFlakyClient,
        maxAttempts: 3,
        retryBaseDelayMs: 0,
      });
      assert.equal(adminRetryOk.success, true);
      assert.equal(adminRetryOk.messageId, "msg_admin_ok");

      // 4. Permanent 422 stops on attempt 1 without wasting retries
      let permCalls = 0;
      const permFailClient = {
        emails: {
          send: async () => {
            permCalls++;
            return { data: null, error: { message: "validation_error: invalid recipient", statusCode: 422 } };
          },
        },
      };
      const permRes = await sendOrderEmails(
        { orderId, userId, eventType: "payment_success" },
        { adminDb, resendClient: permFailClient, maxAttempts: 3, retryBaseDelayMs: 0 }
      );
      assert.equal(permRes.success, false);
      assert.equal(permRes.failureType, "permanent");
      assert.equal(permRes.retryable, false);
      assert.equal(permCalls, 1, "Permanent 4xx must stop immediately without retrying");
      assert.equal(classifyEmailError({ statusCode: 429, message: "rate limit" }).failureType, "transient");
      assert.equal(classifyEmailError({ statusCode: 400, message: "invalid email" }).failureType, "permanent");
    } finally {
      restore();
    }
  });

  await testCase("EMAIL-02: Email suppression blocks cancelled/failed/opted-out/invalid notifications while allowing statutory receipts & zero fees render properly", async () => {
    const restore = setupOfflineEnv({ emails: "sandbox" });
    try {
      const db = new Phase05MockDb();
      let sentCount = 0;
      const spyClient = {
        emails: {
          send: async () => {
            sentCount++;
            return { data: { id: `msg_${sentCount}` }, error: null };
          },
        },
      };

      // 1. Cancelled order suppresses payment_success & shipment updates
      const c1 = seedOnlineOrder(db, {
        orderStatus: "Cancelled",
        paymentStatus: "Refunded",
        isPaid: true,
      });
      const suppPay = await sendOrderEmails(
        { orderId: c1.orderId, userId: c1.userId, eventType: "payment_success" },
        { adminDb: db.client(), resendClient: spyClient }
      );
      assert.equal(suppPay.suppressed, true);
      assert.equal(suppPay.suppressedReason, "order_cancelled_suppresses_payment_success");

      const suppShip = await sendShipmentNotification(c1.orderId, "shipped", {
        adminDb: db.client(),
        resendClient: spyClient,
      });
      assert.equal(suppShip.suppressed, true);
      assert.equal(sentCount, 0);

      // Cancellation email on Cancelled order still delivers cleanly
      const cancelMail = await sendOrderEmails(
        { orderId: c1.orderId, userId: c1.userId, eventType: "order_cancellation", cancelReason: "Out of stock" },
        { adminDb: db.client(), resendClient: spyClient, retryBaseDelayMs: 0 }
      );
      assert.equal(cancelMail.success, true);
      assert.equal(sentCount, 1);

      // 2. Customer opted out suppresses shipment updates, preserves payment_success
      const c2 = seedOnlineOrder(db, {
        orderStatus: "Shipped",
        paymentStatus: "Paid",
        isPaid: true,
        emailNotificationsEnabled: false,
      });
      const optOutShip = await sendShipmentNotification(c2.orderId, "shipped", {
        adminDb: db.client(),
        resendClient: spyClient,
      });
      assert.equal(optOutShip.suppressed, true);
      assert.equal(optOutShip.suppressedReason, "recipient_opted_out_shipment_updates");

      const mandatoryPay = await sendOrderEmails(
        { orderId: c2.orderId, userId: c2.userId, eventType: "payment_success" },
        { adminDb: db.client(), resendClient: spyClient, retryBaseDelayMs: 0 }
      );
      assert.equal(mandatoryPay.success, true);

      // 3. Invalid recipient email suppressed before calling provider
      const c3 = seedOnlineOrder(db, {
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        email: "bad-email-no-domain",
      });
      assert.equal(isValidEmailAddress("bad-email-no-domain"), false);
      const badMail = await sendOrderEmails(
        { orderId: c3.orderId, userId: c3.userId, eventType: "order_confirmation" },
        { adminDb: db.client(), resendClient: spyClient }
      );
      assert.equal(badMail.suppressed, true);
      assert.equal(badMail.suppressedReason, "invalid_recipient_email");

      // 4. Template ₹0.00 fee rendering preserves 0 instead of || 35 / || 10 fallback
      const zeroFeeHtml = renderOrderConfirmationHtml(
        {
          id: "ord_0",
          order_number: "MDS-ZERO",
          total_amount: 500,
          subtotal: 500,
          delivery_fee: 0,
          platform_fee: 0,
          payment_method: "ONLINE",
          created_at: new Date().toISOString(),
          address_snapshot: {
            full_name: "Test <script>",
            phone: "9876543210",
            house_no: "1",
            area: "A",
            city: "Delhi",
            state: "Delhi",
            pincode: "110025",
          },
        },
        [{ title: "Book", price: 500, quantity: 1 }],
        "Test <script>"
      );
      assert.ok(zeroFeeHtml.includes("₹0.00"));
      assert.ok(!zeroFeeHtml.includes("₹35.00"));
      assert.ok(!zeroFeeHtml.includes("<script>alert"));
      assert.ok(escapeHtml("<b>x</b>").includes("&lt;b&gt;x&lt;/b&gt;"));
    } finally {
      restore();
    }
  });

  // ---------------------------------------------------------------------------
  // D. INVOICE ELIGIBILITY, GSTIN CHECKSUM, 36 STATES & ACCOUNTING
  // ---------------------------------------------------------------------------

  await testCase("INV-01: Indian GSTIN mod-36 check digit & 36-state jurisdiction validation", async () => {
    // Valid mod-36 GSTINs
    assert.equal(validateIndianGstin("07AABCU9603R1ZP").valid, true);
    assert.equal(validateIndianGstin("29AABCU9603R1ZJ").valid, true);
    assert.equal(isValidProductionGstin("07AABCU9603R1ZP"), true);
    assert.equal(calculateGstinCheckDigit("07AABCU9603R1Z"), "P");

    // Wrong check digit (e.g. old M instead of P for state 07) & placeholder must fail
    assert.equal(validateIndianGstin("07AABCU9603R1ZM").valid, false);
    assert.equal(isValidProductionGstin("07AABCU9603R1ZM"), false);
    assert.equal(isValidProductionGstin("07AAAAA0000A1Z5"), false);
    assert.equal(isValidProductionGstin("07AABCM1234F1ZZ"), false);
    assert.equal(isValidGstStateCode("00"), false);
    assert.equal(isValidGstStateCode("38"), true);
    assert.equal(isValidGstStateCode("99"), true);

    // State mapping covers Ladakh (38), Telangana (36), TN (33), WB (19), GJ (24), MH (27)
    assert.equal(normalizeStateToGstCode("Ladakh"), "38");
    assert.equal(normalizeStateToGstCode("Telangana"), "36");
    assert.equal(normalizeStateToGstCode("Tamil Nadu"), "33");
    assert.equal(normalizeStateToGstCode("Gujarat"), "24");
    assert.equal(getGstStateName("27"), "Maharashtra");
    assert.equal(getGstStateName("38"), "Ladakh");
  });

  await testCase("INV-02: Strict invoice eligibility blocks unpaid/cancelled/uncollected COD orders & reconciles platform_fee and partial refunds", async () => {
    const restore = setupOfflineEnv();
    try {
      const db = new Phase05MockDb();
      const adminDb = db.client();

      // 1. Unpaid ONLINE Pending order -> blocked (409)
      const unpaidOnline = seedOnlineOrder(db, { orderStatus: "Pending", paymentStatus: "Pending", isPaid: false });
      const invUnpaid = await getOrCreateOrderInvoice(unpaidOnline.orderId, "07AABCU9603R1ZP", { adminDb });
      assert.equal(invUnpaid.success, false);
      assert.equal(invUnpaid.statusCode, 409);

      // 2. Cancelled order -> blocked
      const cancelled = seedOnlineOrder(db, { orderStatus: "Cancelled", paymentStatus: "Refunded", isPaid: true });
      const invCancel = await getOrCreateOrderInvoice(cancelled.orderId, "07AABCU9603R1ZP", { adminDb });
      assert.equal(invCancel.success, false);

      // 3. Uncollected Confirmed COD order -> blocked; Collected or Delivered COD -> allowed
      const codPre = seedOnlineOrder(db, { orderStatus: "Confirmed", paymentStatus: "Pending", isPaid: false });
      db.orders.get(codPre.orderId)!.payment_method = "COD";
      db.orders.get(codPre.orderId)!.cod_collection_status = "uncollected";
      const invCodBlocked = await getOrCreateOrderInvoice(codPre.orderId, "07AABCU9603R1ZP", { adminDb });
      assert.equal(invCodBlocked.success, false);
      assert.equal(invCodBlocked.errorCode, "INVOICE_COD_NOT_ELIGIBLE");

      db.orders.get(codPre.orderId)!.order_status = "Delivered";
      db.orders.get(codPre.orderId)!.address_snapshot.state = "Ladakh";
      db.orders.get(codPre.orderId)!.address_snapshot.pincode = "194101";
      const invCodOk = await getOrCreateOrderInvoice(codPre.orderId, "07AABCU9603R1ZP", { adminDb });
      assert.equal(invCodOk.success, true);
      assert.equal(invCodOk.invoice?.place_of_supply_code, "38");
      assert.equal(invCodOk.invoice?.igst_rate, 18);
      assert.equal(invCodOk.invoice?.platform_fee, 10);

      // 4. Paid ONLINE order with invalid customer GSTIN rejected; valid customer GSTIN persists + immutable across partial refund
      const paid = seedOnlineOrder(db, {
        orderStatus: "Delivered",
        paymentStatus: "Paid",
        isPaid: true,
        subtotal: 900,
        platformFee: 10,
        deliveryFee: 35,
        totalAmount: 945,
      });

      const badCustGstin = await getOrCreateOrderInvoice(paid.orderId, "07AABCU9603R1ZP", {
        adminDb,
        customerGstin: "27AABCU9603R1ZZ", // wrong check digit for 27
      });
      assert.equal(badCustGstin.success, false);
      assert.equal(badCustGstin.errorCode, "INVALID_CUSTOMER_GSTIN");

      const validPaidInv = await getOrCreateOrderInvoice(paid.orderId, "07AABCU9603R1ZP", {
        adminDb,
        customerGstin: "29AABCU9603R1ZJ",
      });
      assert.equal(validPaidInv.success, true);
      assert.equal(validPaidInv.invoice?.platform_fee, 10);
      assert.equal(validPaidInv.invoice?.taxable_value, 900);
      assert.equal(validPaidInv.invoice?.shipping_charges, 35);
      assert.equal(validPaidInv.invoice?.grand_total, 945);
      assert.equal(validPaidInv.invoice?.customer_gstin, "29AABCU9603R1ZJ");

      // Post-invoice partial refund preserves original immutable invoice and attaches refundSummary
      const rfndId = db.nextUuid();
      db.refund_records.set(rfndId, {
        id: rfndId,
        order_id: paid.orderId,
        amount: 300,
        status: "processed",
        gateway_refund_id: "rfnd_inv_part_1",
        payment_channel: "razorpay",
        reason: "One book returned",
        created_at: new Date().toISOString(),
      });
      db.orders.get(paid.orderId)!.payment_status = "Partially Refunded";

      const invAfterRefund = await getOrCreateOrderInvoice(paid.orderId, "07AABCU9603R1ZP", { adminDb });
      assert.equal(invAfterRefund.success, true);
      assert.equal(invAfterRefund.invoice?.invoice_number, validPaidInv.invoice?.invoice_number);
      assert.equal(invAfterRefund.invoice?.refundSummary?.refundedAmount, 300);
      assert.equal(invAfterRefund.invoice?.refundSummary?.netAmountAfterRefunds, 645);

      // Failed refund credit note blocked
      const failedRfndId = db.nextUuid();
      db.refund_records.set(failedRfndId, {
        id: failedRfndId,
        order_id: paid.orderId,
        amount: 100,
        status: "failed",
        reason: "Failed attempt",
        created_at: new Date().toISOString(),
      });
      const failedCn = await getOrderRefundCreditNote(failedRfndId, { adminDb });
      assert.equal(failedCn.success, false);
      assert.equal(failedCn.statusCode, 409);
    } finally {
      restore();
    }
  });

  // ---------------------------------------------------------------------------
  // E. SHIPPING FEE & PRICING SINGLE SOURCE OF TRUTH CONSISTENCY
  // ---------------------------------------------------------------------------

  await testCase("FEE-01: Single pricing SSOT matches across BUSINESS_CONFIG, Cart/Checkout, Razorpay paise, Invoices & Delhivery", async () => {
    assert.equal(PLATFORM_FEE, 10);
    assert.equal(DELIVERY_FEE, 35);
    assert.equal(BUSINESS_CONFIG.shipping.standardShippingFee, 35);
    assert.equal(BUSINESS_CONFIG.shipping.platformFee, 10);
    assert.deepStrictEqual(calculateOrderFees(false), { platformFee: 0, deliveryFee: 0 });
    assert.deepStrictEqual(calculateOrderFees(true), { platformFee: 10, deliveryFee: 35 });

    // Fractional 10% discount on ₹899 -> ₹809.10 * 2 = ₹1618.20 (matches SQL ROUND(..., 2))
    const unit = calculateDiscountedUnitPrice(899, 10);
    assert.equal(unit, 809.1);
    assert.equal(calculateLineTotal(unit, 2), 1618.2);

    const summary = calculateOrderPricing({
      items: [{ price: 899, discount: 10, quantity: 2 }],
      couponDiscount: 100,
    });
    // 1618.20 - 100 + 10 + 35 = 1563.20
    assert.equal(summary.subtotal, 1618.2);
    assert.equal(summary.totalAmount, 1563.2);
    assert.equal(toPaise(summary.totalAmount), 156320);

    const tax = calculateOrderTaxBreakdown({
      subtotal: summary.subtotal,
      discount: summary.discountAmount,
      shippingFee: summary.deliveryFee,
      platformFee: summary.platformFee,
      stateCode: "Maharashtra",
      sellerGstin: "07AABCU9603R1ZP",
    });
    assert.equal(tax.grandTotal, summary.totalAmount);
    assert.equal(tax.isInterstate, true);
    assert.equal(roundCurrency(tax.cgstAmount + tax.sgstAmount + tax.igstAmount), tax.totalTax);

    // Delhivery COD consignment amount matches authoritative order total
    const payloadCheck = validateDelhiveryBookingPayload(
      {
        id: "00000000-0000-4000-8000-000000000999",
        order_number: "MDS-SSOT-1",
        payment_method: "COD",
        total_amount: summary.totalAmount,
        address_snapshot: {
          full_name: "Imran Khan",
          house_no: "12A",
          area: "Bandra West",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400050",
          phone: "9876543210",
        },
      },
      [{ title: "Riyad us-Saliheen", quantity: 2, books: { weight_grams: 450 } }],
      { pickupLocation: "MD SHAKIB ISLAMIC BOOKS" }
    );
    assert.equal(payloadCheck.valid, true);
    assert.equal(payloadCheck.consignmentData?.shipments[0].total_amount, 1563.2);
    assert.equal(payloadCheck.consignmentData?.shipments[0].cod_amount, 1563.2);
  });

  // ---------------------------------------------------------------------------
  // F. MIGRATION & REPO INVARIANT CHECKS
  // ---------------------------------------------------------------------------

  await testCase("MIG-01: Phase 05 SQL migration and repo code satisfy all required Phase 05 invariants", async () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const migrationPath = path.join(
      repoRoot,
      "supabase/migrations/20261114000001_phase05_payments_emails_invoices_hardening.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 20261114000001 must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(sql.includes("idx_orders_razorpay_payment_id_unique"), "Must add unique razorpay_payment_id index");
    assert.ok(sql.includes("idx_payments_single_settled_per_order"), "Must prevent duplicate settled payment rows");
    assert.ok(sql.includes("idx_email_logs_idempotency_key_unique"), "Must enforce unique email idempotency_key");
    assert.ok(sql.includes("email_notifications_enabled"), "Must add notification preference column");
    assert.ok(sql.includes("public.is_valid_gstin"), "Must add SQL GSTIN checksum helper");
    assert.ok(sql.includes("public.resolve_indian_state_gst_code"), "Must add SQL 36-state resolver");
    assert.ok(sql.includes("payment_not_captured"), "SQL settle_payment_atomic must check captured status");
    assert.ok(sql.includes("INVOICE_PAYMENT_UNPAID"), "SQL generate_order_invoice_atomic must check payment eligibility");
    assert.ok(sql.includes("INVOICE_COD_NOT_ELIGIBLE"), "SQL generate_order_invoice_atomic must gate uncollected COD");

    const invRoute = fs.readFileSync(
      path.join(repoRoot, "apps/web/app/api/documents/invoice/[orderId]/route.ts"),
      "utf8"
    );
    assert.ok(!invRoute.includes("State: Delhi (07)"), "Invoice route must not hardcode Delhi (07)");
    assert.ok(invRoute.includes("escapeHtml("), "Invoice route must escape dynamic HTML values");
    assert.ok(invRoute.includes("platform_fee"), "Invoice route must display platform_fee");

    const businessSrc = fs.readFileSync(path.join(repoRoot, "apps/web/lib/config/business.ts"), "utf8");
    assert.ok(!businessSrc.includes("standardShippingFee: 49"), "Business config must not hardcode mismatched fee 49");
  });

  console.log("\n" + "=".repeat(80));
  console.log(`PHASE 05 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("=".repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled Phase 05 test crash:", err);
  process.exit(1);
});
