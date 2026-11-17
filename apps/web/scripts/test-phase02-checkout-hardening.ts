/**
 * Phase 02 Verification Suite: Critical Bug Fixes & Checkout Hardening
 *
 * Offline verification covering:
 * - C-1: Online Order Cancellation, Razorpay Refunds, Partial/Full Caps, Retries & Webhooks
 * - H-1: Delhivery COD Serviceability Fail-Closed Gate, Timeouts, Caching & Online Resilience
 * - H-3: Expired Online Reservations Cleanup, Coupon/Stock Idempotency & Late-Settlement Races
 * - H-8: Payment Method Switching (ONLINE <-> COD), Fingerprinting & Multi-Attempt Retries
 * - H-2: Privileged RPC Lockdown, Server-Derived Address/Pricing & Privilege Matrix Audit
 *
 * Zero real network requests or remote Supabase mutations are executed.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  checkPincodeServiceability,
  clearPincodeServiceabilityCache,
  verifyCodServiceabilityStrict,
} from "../lib/integrations/delhivery/service";
import { GET as serviceabilityRouteGet } from "../app/api/shipping/serviceability/route";
import { POST as cronReleasePost, GET as cronReleaseGet } from "../app/api/cron/release-reservations/route";
import {
  createRazorpayOrder,
  initiateRazorpayRefund,
  mapDbRefundStatusToLifecycle,
  verifyAndSettlePayment,
} from "../lib/integrations/razorpay/service";
import { processRazorpayWebhook } from "../lib/integrations/razorpay/webhook";
import {
  executeAdminRefundRetry,
  executeOrderCancellation,
  executeOrderCheckout,
  executeRetryOrderPayment,
} from "../lib/commerce/orders-core";
import { runReleaseExpiredReservationsWorker } from "../lib/commerce/reservations";

type DbRole = "anon" | "authenticated" | "service_role";

// ---------------------------------------------------------------------------
// Deterministic In-Memory PostgreSQL / Supabase Simulator
// ---------------------------------------------------------------------------
class OfflinePostgresSimulator {
  profiles = new Map<string, any>();
  addresses = new Map<string, any>();
  books = new Map<string, any>();
  discounts = new Map<string, any>();
  carts = new Map<string, any>();
  cart_items: any[] = [];
  orders = new Map<string, any>();
  order_items: any[] = [];
  order_status_history: any[] = [];
  order_idempotency_keys = new Map<string, any>();
  inventory_reservations: any[] = [];
  payments = new Map<string, any>();
  payment_attempts: any[] = [];
  refund_records = new Map<string, any>();
  order_consents: any[] = [];
  webhook_events = new Map<string, any>();
  audit_logs: any[] = [];

  private seq = 1;
  nextUuid(prefix = "00000000-0000-4000-8000-"): string {
    const n = String(this.seq++).padStart(12, "0");
    return `${prefix}${n}`;
  }

  clientFor(role: DbRole) {
    return new SimSupabaseClient(this, role);
  }

  private assertServiceRole(fnName: string, role: DbRole) {
    if (role !== "service_role") {
      throw new Error(`permission denied for function ${fnName} (role=${role})`);
    }
  }

  callRpc(name: string, args: any, role: DbRole) {
    switch (name) {
      case "create_order_atomic":
        this.assertServiceRole(name, role);
        return this.rpcCreateOrderAtomic(args);
      case "cancel_order_atomic":
        this.assertServiceRole(name, role);
        return this.rpcCancelOrderAtomic(args);
      case "record_order_consent_atomic":
        this.assertServiceRole(name, role);
        return this.rpcRecordOrderConsentAtomic(args);
      case "prepare_payment_attempt_atomic":
        this.assertServiceRole(name, role);
        return this.rpcPreparePaymentAttemptAtomic(args);
      case "settle_payment_atomic":
        this.assertServiceRole(name, role);
        return this.rpcSettlePaymentAtomic(args);
      case "record_payment_failure_atomic":
        this.assertServiceRole(name, role);
        return this.rpcRecordPaymentFailureAtomic(args);
      case "record_refund_atomic":
        this.assertServiceRole(name, role);
        return this.rpcRecordRefundAtomic(args);
      case "release_expired_reservations_atomic":
        this.assertServiceRole(name, role);
        return this.rpcReleaseExpiredReservationsAtomic(args);
      default:
        throw new Error(`Unsupported RPC in offline simulator: ${name}`);
    }
  }

  private rpcCreateOrderAtomic(args: any): string {
    const userId = args.p_user_id;
    const profile = this.profiles.get(userId);
    if (!profile) throw new Error(`Customer profile ${userId} not found.`);
    if (profile.is_blocked || profile.is_deleted) {
      throw new Error("Account is restricted or deactivated and cannot place orders.");
    }

    const paymentMethod = args.p_payment_method;
    if (paymentMethod !== "COD" && paymentMethod !== "ONLINE") {
      throw new Error(`Invalid payment method: ${paymentMethod}`);
    }

    if (paymentMethod === "COD" && args.p_cod_verified !== true) {
      throw new Error("Cash on Delivery serviceability must be verified before creating a COD order.");
    }

    const rawItems: Array<{ book_id: string; quantity: number }> = args.p_items || [];
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error("Order items cannot be empty");
    }

    // Aggregate duplicate book_ids just like hardened SQL
    const aggMap = new Map<string, number>();
    for (const item of rawItems) {
      const qty = Number(item.quantity || 0);
      aggMap.set(item.book_id, (aggMap.get(item.book_id) || 0) + qty);
    }
    const normalizedItems = Array.from(aggMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([book_id, quantity]) => ({ book_id, quantity }));

    // Authoritative address derivation
    let effectiveSnapshot: any;
    const addressId = args.p_address_id || null;
    if (addressId) {
      const addr = this.addresses.get(addressId);
      if (!addr || addr.user_id !== userId) {
        throw new Error(`Delivery address ${addressId} does not exist or does not belong to user.`);
      }
      if (!/^\d{6}$/.test(String(addr.pincode || "").trim())) {
        throw new Error("Delivery address has an invalid 6-digit pincode.");
      }
      effectiveSnapshot = {
        full_name: addr.full_name.trim(),
        phone: addr.phone.trim(),
        house_no: addr.house_no.trim(),
        area: addr.area.trim(),
        city: addr.city.trim(),
        state: addr.state.trim(),
        pincode: addr.pincode.trim(),
        landmark: addr.landmark ?? null,
        address_type: addr.address_type,
      };
    } else {
      effectiveSnapshot = args.p_address_snapshot;
      if (!effectiveSnapshot || !/^\d{6}$/.test(String(effectiveSnapshot.pincode || "").trim())) {
        throw new Error("Delivery address snapshot is incomplete or contains invalid pincode.");
      }
    }

    const cleanCoupon = args.p_coupon_code ? String(args.p_coupon_code).trim().toUpperCase() : "";
    const cleanIdem = args.p_idempotency_key ? String(args.p_idempotency_key).trim() : null;
    const fingerprint = crypto
      .createHash("sha256")
      .update(
        `${userId}|${paymentMethod}|${addressId || ""}|${cleanCoupon}|${JSON.stringify(
          normalizedItems
        )}|${JSON.stringify(effectiveSnapshot)}`
      )
      .digest("hex");

    if (cleanIdem) {
      const keyLookup = `${userId}::${cleanIdem}`;
      const existingKeyRec = this.order_idempotency_keys.get(keyLookup);
      if (existingKeyRec) {
        const existingOrd = this.orders.get(existingKeyRec.order_id);
        if (
          existingKeyRec.request_fingerprint !== fingerprint ||
          (existingOrd && existingOrd.payment_method !== paymentMethod)
        ) {
          throw new Error(
            `Idempotency conflict: Key "${cleanIdem}" has already been used with a different payment method or checkout payload.`
          );
        }
        return existingKeyRec.order_id;
      }
    }

    if (args.p_require_cart) {
      const cart = Array.from(this.carts.values()).find((c) => c.user_id === userId);
      const userCartItems = cart
        ? this.cart_items
            .filter((ci) => ci.cart_id === cart.id)
            .map((ci) => ({ book_id: ci.book_id, quantity: ci.quantity }))
            .sort((a, b) => a.book_id.localeCompare(b.book_id))
        : [];

      if (userCartItems.length === 0) {
        throw new Error("Your shopping cart has already been checked out or is empty.");
      }
      if (JSON.stringify(userCartItems) !== JSON.stringify(normalizedItems)) {
        throw new Error("Your shopping cart changed while placing this order.");
      }
    }

    // Authoritative price computation from DB tables (ignores client price/total_amount)
    let subtotal = 0;
    const calcItems: any[] = [];
    for (const item of normalizedItems) {
      const book = this.books.get(item.book_id);
      if (!book) throw new Error(`Book ${item.book_id} not found`);
      if (!book.is_active) throw new Error(`Book "${book.title}" is currently inactive`);
      if (item.quantity < 1 || item.quantity > 1000) throw new Error("Invalid quantity");
      if (book.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${book.title}"`);
      }
      const effectivePrice = Number(
        (Number(book.price) * (1 - Number(book.discount || 0) / 100)).toFixed(2)
      );
      const lineTotal = Number((effectivePrice * item.quantity).toFixed(2));
      subtotal += lineTotal;
      calcItems.push({
        book_id: book.id,
        title: book.title,
        image_url: book.image_url,
        effective_price: effectivePrice,
        quantity: item.quantity,
      });
    }

    let couponDiscount = 0;
    let couponStatus = "none";
    if (cleanCoupon) {
      const coupon = Array.from(this.discounts.values()).find(
        (d) => String(d.code).toUpperCase() === cleanCoupon
      );
      if (!coupon || !coupon.is_active) throw new Error("Invalid or inactive coupon");
      if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
        throw new Error("This coupon has reached its maximum usage limit.");
      }
      if (subtotal < Number(coupon.min_order_amount || 0)) {
        throw new Error("Minimum order amount for coupon not met.");
      }
      if (coupon.discount_type === "percentage") {
        couponDiscount = Number(((subtotal * Number(coupon.discount_value)) / 100).toFixed(2));
        if (coupon.max_discount_amount !== null) {
          couponDiscount = Math.min(couponDiscount, Number(coupon.max_discount_amount));
        }
      } else {
        couponDiscount = Math.min(Number(coupon.discount_value), subtotal);
      }
      coupon.used_count += 1;
      couponStatus = paymentMethod === "COD" ? "consumed" : "reserved";
    }

    const platformFee = 10;
    const deliveryFee = 35;
    const totalAmount = Math.max(
      0,
      Number((subtotal + platformFee + deliveryFee - couponDiscount).toFixed(2))
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const reservationExpiresAt =
      paymentMethod === "ONLINE"
        ? new Date(now.getTime() + 15 * 60 * 1000).toISOString()
        : null;

    const orderId = this.nextUuid();
    const order = {
      id: orderId,
      order_number: `MDS-${100000 + this.orders.size + 1}`,
      user_id: userId,
      address_id: addressId,
      cod_serviceability_verified: paymentMethod === "COD" && args.p_cod_verified === true,
      total_amount: totalAmount,
      subtotal,
      platform_fee: platformFee,
      delivery_fee: deliveryFee,
      discount_amount: couponDiscount,
      coupon_code: cleanCoupon || null,
      coupon_status: couponStatus,
      payment_method: paymentMethod,
      payment_status: "Pending",
      order_status: "Pending",
      address_snapshot: effectiveSnapshot,
      is_paid: false,
      paid_at: null,
      cancel_reason: null,
      razorpay_order_id: null,
      razorpay_payment_id: null,
      razorpay_refund_id: null,
      refund_amount: null,
      refund_status: null,
      refunded_at: null,
      idempotency_key: cleanIdem,
      request_fingerprint: fingerprint,
      reservation_expires_at: reservationExpiresAt,
      expired_at: null,
      consent_record: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.orders.set(orderId, order);
    if (cleanIdem) {
      this.order_idempotency_keys.set(`${userId}::${cleanIdem}`, {
        idempotency_key: cleanIdem,
        user_id: userId,
        request_fingerprint: fingerprint,
        order_id: orderId,
      });
    }

    for (const item of calcItems) {
      const book = this.books.get(item.book_id)!;
      book.stock -= item.quantity;
      this.inventory_reservations.push({
        id: this.nextUuid(),
        order_id: orderId,
        book_id: item.book_id,
        quantity: item.quantity,
        status: paymentMethod === "COD" ? "committed" : "reserved",
        payment_method: paymentMethod,
        expires_at: reservationExpiresAt,
        released_at: null,
        expired_at: null,
        release_reason: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
      this.order_items.push({
        id: this.nextUuid(),
        order_id: orderId,
        book_id: item.book_id,
        title: item.title,
        price: item.effective_price,
        quantity: item.quantity,
        image_url: item.image_url,
      });
    }

    // Clear user's cart atomically
    const cart = Array.from(this.carts.values()).find((c) => c.user_id === userId);
    if (cart) {
      this.cart_items = this.cart_items.filter((ci) => ci.cart_id !== cart.id);
    }

    return orderId;
  }

  private rpcCancelOrderAtomic(args: any): boolean {
    const order = this.orders.get(args.p_order_id);
    if (!order) throw new Error(`Order ${args.p_order_id} not found`);

    const isAdmin = Boolean(args.p_is_admin);
    if (isAdmin) {
      const prof = this.profiles.get(args.p_user_id);
      if (
        !prof ||
        !["super_admin", "admin", "order_manager"].includes(prof.role) ||
        prof.is_blocked ||
        prof.is_deleted
      ) {
        throw new Error("Unauthorized: Administrative role required.");
      }
    } else if (order.user_id !== args.p_user_id) {
      throw new Error("Not authorized to cancel order.");
    }

    if (!isAdmin && ["Shipped", "Out for Delivery"].includes(order.order_status)) {
      throw new Error("Order has already been dispatched with courier.");
    }

    if (["Cancelled", "Delivered", "Returned"].includes(order.order_status)) {
      throw new Error(`Order cannot be cancelled in ${order.order_status} status`);
    }

    const nowIso = new Date().toISOString();

    if (!["Shipped", "Out for Delivery"].includes(order.order_status)) {
      for (const res of this.inventory_reservations.filter(
        (r) => r.order_id === order.id && (r.status === "reserved" || r.status === "committed")
      )) {
        const book = this.books.get(res.book_id);
        if (book) book.stock += res.quantity;
        res.status = "released";
        res.released_at = nowIso;
        res.release_reason = "order_cancelled";
        res.updated_at = nowIso;
      }
    }

    if (
      (order.coupon_status === "reserved" || order.coupon_status === "consumed") &&
      order.coupon_code
    ) {
      const coupon = Array.from(this.discounts.values()).find(
        (d) => String(d.code).toUpperCase() === String(order.coupon_code).toUpperCase()
      );
      if (coupon) coupon.used_count = Math.max(0, coupon.used_count - 1);
      order.coupon_status = "released";
    }

    if (
      (order.is_paid || ["Paid", "Partially Refunded"].includes(order.payment_status)) &&
      order.payment_method === "ONLINE"
    ) {
      const alreadyRefunded = Array.from(this.refund_records.values())
        .filter((r) => r.order_id === order.id && r.status === "processed")
        .reduce((s, r) => s + Number(r.amount), 0);

      order.payment_status = "Refund Pending";
      order.refund_status = "pending";
      order.refund_amount = Math.max(0, Number(order.total_amount) - alreadyRefunded);
    } else {
      order.payment_status = "Failed";
      order.refund_status = "not_required";
      order.refund_amount = null;
    }

    order.order_status = "Cancelled";
    order.cancel_reason = args.p_cancel_reason || "Cancelled by customer";
    order.updated_at = nowIso;

    for (const att of this.payment_attempts) {
      if (att.order_id === order.id && (att.status === "initiated" || att.status === "pending")) {
        att.status = "superseded";
        att.updated_at = nowIso;
      }
    }

    return true;
  }

  private rpcRecordOrderConsentAtomic(args: any) {
    const order = this.orders.get(args.p_order_id);
    if (!order) return { success: false, error: "Order not found." };
    if (order.user_id !== args.p_user_id) return { success: false, error: "Unauthorized" };
    if (args.p_terms_accepted !== true) return { success: false, error: "Consent required" };

    const id = this.nextUuid();
    const data = {
      terms_accepted: true,
      terms_version: args.p_terms_version || "2026.11-v1",
      privacy_version: args.p_privacy_version || "2026.11-v1",
      shipping_policy_version: args.p_shipping_version || "2026.11-v1",
      returns_policy_version: args.p_returns_version || "2026.11-v1",
      accepted_at: new Date().toISOString(),
      ip_address: args.p_ip_address || null,
      user_agent: args.p_user_agent || null,
    };
    this.order_consents.push({ id, order_id: order.id, user_id: args.p_user_id, ...data });
    order.consent_record = data;
    return { success: true, consent_id: id };
  }

  private rpcPreparePaymentAttemptAtomic(args: any) {
    const order = this.orders.get(args.p_order_id);
    if (!order) return { success: false, error: "Order not found." };
    if (order.user_id !== args.p_user_id) return { success: false, error: "Unauthorized" };
    if (order.payment_method !== "ONLINE") return { success: false, error: "Only ONLINE orders supported." };
    if (
      order.is_paid ||
      ["Paid", "Partially Refunded", "Refund Pending", "Refunded"].includes(order.payment_status)
    ) {
      return { success: false, error: "Order payment is already settled or refunded." };
    }
    if (order.order_status !== "Pending") {
      return { success: false, error: `Payment cannot be initiated in status ${order.order_status}.` };
    }

    const resRows = this.inventory_reservations.filter((r) => r.order_id === order.id);
    if (resRows.some((r) => r.status === "expired" || r.status === "released")) {
      return {
        success: false,
        error: "Order inventory reservation has already expired or been released. Please place a new order.",
      };
    }

    const activePayments = Array.from(this.payments.values())
      .filter(
        (p) =>
          p.order_id === order.id &&
          p.provider === "Razorpay" &&
          p.status === "Pending" &&
          p.is_active !== false
      )
      .sort((a, b) => Number(b.attempt_number || 1) - Number(a.attempt_number || 1));

    if (activePayments.length > 0 && !args.p_force_new_attempt) {
      return {
        success: true,
        action: "reuse",
        provider_order_id: activePayments[0].provider_order_id,
        attempt_number: activePayments[0].attempt_number || 1,
        amount: order.total_amount,
      };
    }

    if (args.p_force_new_attempt) {
      for (const p of this.payments.values()) {
        if (p.order_id === order.id && p.status === "Pending") {
          p.is_active = false;
        }
      }
      for (const att of this.payment_attempts) {
        if (att.order_id === order.id && (att.status === "initiated" || att.status === "pending")) {
          att.status = "superseded";
        }
      }
    }

    const maxAttempt = Array.from(this.payments.values())
      .filter((p) => p.order_id === order.id)
      .reduce((max, p) => Math.max(max, Number(p.attempt_number || 1)), 0);

    return {
      success: true,
      action: "create_new",
      attempt_number: maxAttempt + 1,
      amount: order.total_amount,
    };
  }

  private rpcSettlePaymentAtomic(args: any) {
    const rzpOrderId = args.p_razorpay_order_id;
    const rzpPaymentId = args.p_razorpay_payment_id;
    const raw = args.p_raw_response || {};

    let payment = Array.from(this.payments.values()).find((p) => p.provider_order_id === rzpOrderId);
    let order =
      Array.from(this.orders.values()).find((o) => o.razorpay_order_id === rzpOrderId) ||
      (payment ? this.orders.get(payment.order_id) : undefined);

    if (!order) return { success: false, status: "order_not_found", message: "Order not found" };
    if (!payment) return { success: false, status: "payment_record_not_found", message: "Payment record not found" };
    if (order.payment_method === "COD") {
      return { success: false, status: "invalid_payment_method", message: "COD not allowed" };
    }

    if (order.razorpay_payment_id && order.razorpay_payment_id !== rzpPaymentId) {
      payment.provider_payment_id = rzpPaymentId;
      payment.status = "Paid";
      return {
        success: false,
        status: "payment_id_conflict",
        message: "Duplicate capture on already paid order",
        order_id: order.id,
        requires_refund: true,
      };
    }

    if (order.is_paid || order.payment_status === "Paid") {
      if (["Refunded", "Partially Refunded", "Refund Pending"].includes(order.payment_status)) {
        return { success: false, status: "order_status_invalid", order_id: order.id };
      }
      if (payment.status === "Pending") {
        payment.status = "Paid";
        payment.provider_payment_id = rzpPaymentId;
        return { success: true, status: "already_paid", order_id: order.id, user_id: order.user_id, settled: false, reconciled: true };
      }
      return { success: true, status: "already_paid", order_id: order.id, user_id: order.user_id, settled: false, reconciled: false };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const activeRes = this.inventory_reservations.filter(
      (r) => r.order_id === order.id && r.status === "reserved" && (!r.expires_at || new Date(r.expires_at) >= now)
    );
    const itemsForOrder = this.order_items.filter((i) => i.order_id === order.id);
    const exactCoverage =
      itemsForOrder.length > 0 &&
      activeRes.length === itemsForOrder.length &&
      itemsForOrder.every((oi) => activeRes.find((r) => r.book_id === oi.book_id)?.quantity === oi.quantity);

    if (exactCoverage && order.order_status === "Pending") {
      order.payment_status = "Paid";
      order.order_status = "Confirmed";
      order.is_paid = true;
      order.paid_at = nowIso;
      order.razorpay_order_id = rzpOrderId;
      order.razorpay_payment_id = rzpPaymentId;
      if (order.coupon_status === "reserved") order.coupon_status = "consumed";

      payment.status = "Paid";
      payment.provider_payment_id = rzpPaymentId;
      payment.raw_response = raw;

      for (const r of activeRes) {
        r.status = "committed";
        r.expires_at = null;
      }
      return { success: true, status: "settled", order_id: order.id, user_id: order.user_id, settled: true };
    }

    if (order.order_status === "Cancelled" && order.cancel_reason !== "Payment reservation expired") {
      payment.status = "Paid";
      payment.provider_payment_id = rzpPaymentId;
      order.payment_status = "Paid";
      order.is_paid = true;
      order.paid_at = nowIso;
      order.refund_status = "pending";
      order.refund_amount = order.total_amount;
      order.razorpay_order_id = rzpOrderId;
      order.razorpay_payment_id = rzpPaymentId;
      return {
        success: false,
        status: "cancelled_non_recoverable",
        order_id: order.id,
        settled: false,
        requires_refund: true,
        message: "Order was cancelled; refund required",
      };
    }

    // Recovery check after reservation expired
    let stockAvailable = true;
    for (const oi of itemsForOrder) {
      const book = this.books.get(oi.book_id);
      if (!book || book.stock < oi.quantity) {
        stockAvailable = false;
        break;
      }
    }

    if (!stockAvailable) {
      payment.status = "Paid";
      payment.provider_payment_id = rzpPaymentId;
      order.payment_status = "Paid";
      order.is_paid = true;
      order.paid_at = nowIso;
      order.order_status = "Cancelled";
      order.cancel_reason = "Payment received after reservation expired; stock unavailable for fulfillment. Marked for refund.";
      order.refund_status = "pending";
      order.refund_amount = order.total_amount;
      order.razorpay_order_id = rzpOrderId;
      order.razorpay_payment_id = rzpPaymentId;
      return {
        success: false,
        status: "expired_stock_unavailable",
        order_id: order.id,
        settled: false,
        requires_refund: true,
        message: "Payment captured after expiry but stock unavailable.",
      };
    }

    for (const oi of itemsForOrder) {
      const book = this.books.get(oi.book_id)!;
      book.stock -= oi.quantity;
    }
    for (const r of this.inventory_reservations.filter((r) => r.order_id === order.id)) {
      r.status = "committed";
      r.expires_at = null;
    }
    if (order.coupon_status === "released" && order.coupon_code) {
      const coupon = Array.from(this.discounts.values()).find(
        (d) => String(d.code).toUpperCase() === String(order.coupon_code).toUpperCase()
      );
      if (coupon) coupon.used_count += 1;
      order.coupon_status = "consumed";
    }
    order.payment_status = "Paid";
    order.order_status = "Confirmed";
    order.is_paid = true;
    order.paid_at = nowIso;
    order.cancel_reason = null;
    order.razorpay_order_id = rzpOrderId;
    order.razorpay_payment_id = rzpPaymentId;
    payment.status = "Paid";
    payment.provider_payment_id = rzpPaymentId;

    return { success: true, status: "settled_recovered", order_id: order.id, user_id: order.user_id, settled: true };
  }

  private rpcRecordPaymentFailureAtomic(args: any) {
    const payment = Array.from(this.payments.values()).find(
      (p) => p.provider_order_id === args.p_razorpay_order_id
    );
    const order =
      Array.from(this.orders.values()).find(
        (o) => o.razorpay_order_id === args.p_razorpay_order_id
      ) || (payment ? this.orders.get(payment.order_id) : undefined);

    if (order && (order.is_paid || order.payment_status === "Paid")) {
      return { success: false, status: "ignored_already_paid" };
    }
    if (payment && payment.status === "Paid") {
      return { success: false, status: "ignored_already_paid" };
    }
    if (payment) {
      payment.status = "Failed";
      payment.raw_response = args.p_raw_response || {};
    }
    if (order) {
      for (const r of this.inventory_reservations.filter(
        (r) => r.order_id === order.id && r.status === "reserved"
      )) {
        const book = this.books.get(r.book_id);
        if (book) book.stock += r.quantity;
        r.status = "released";
        r.released_at = new Date().toISOString();
      }
      if (order.coupon_status === "reserved" && order.coupon_code) {
        const coupon = Array.from(this.discounts.values()).find(
          (d) => String(d.code).toUpperCase() === String(order.coupon_code).toUpperCase()
        );
        if (coupon) coupon.used_count = Math.max(0, coupon.used_count - 1);
        order.coupon_status = "released";
      }
      order.payment_status = "Failed";
      order.order_status = "Cancelled";
      order.cancel_reason = "Payment failed or rejected by payment gateway";
    }
    return { success: true, status: "recorded_failure", order_id: order?.id };
  }

  private rpcRecordRefundAtomic(args: any) {
    const order = this.orders.get(args.p_order_id);
    if (!order) throw new Error(`Order ${args.p_order_id} not found`);

    const status = args.p_refund_status;
    if (!["not_required", "pending", "processing", "processed", "failed"].includes(status)) {
      throw new Error(`Invalid refund status: ${status}`);
    }

    const rawId = args.p_refund_id ? String(args.p_refund_id).trim() : null;
    const cleanRefundId = rawId && !rawId.startsWith("rfnd_err_") ? rawId : null;
    const amount = Number(args.p_refund_amount || 0);
    const nowIso = new Date().toISOString();

    if (status !== "not_required" && amount <= 0) {
      throw new Error("Refund amount must be positive");
    }
    if ((status === "processing" || status === "processed") && !cleanRefundId) {
      throw new Error(`Real gateway refund ID required for status ${status}`);
    }

    let existingRec =
      (args.p_refund_record_id ? this.refund_records.get(args.p_refund_record_id) : undefined) ||
      (cleanRefundId
        ? Array.from(this.refund_records.values()).find((r) => r.gateway_refund_id === cleanRefundId)
        : undefined) ||
      (args.p_idempotency_key
        ? Array.from(this.refund_records.values()).find(
            (r) => r.idempotency_key === args.p_idempotency_key
          )
        : undefined);

    if (existingRec && existingRec.status === "processed") {
      if (status === "processed") {
        return {
          success: true,
          status: "already_processed",
          order_id: order.id,
          refund_id: existingRec.gateway_refund_id,
          refund_record_id: existingRec.id,
        };
      }
      return {
        success: false,
        status: "cannot_downgrade_processed_refund",
        message: "Cannot downgrade processed refund",
      };
    }

    const existingSettled = Array.from(this.refund_records.values())
      .filter((r) => r.order_id === order.id && r.status === "processed" && r.id !== existingRec?.id)
      .reduce((s, r) => s + Number(r.amount), 0);

    if (
      ["pending", "processing", "processed"].includes(status) &&
      existingSettled + amount > Number(order.total_amount) + 0.01
    ) {
      throw new Error("Cumulative refund amount exceeds order total");
    }

    let recId: string;
    if (existingRec) {
      existingRec.gateway_refund_id = cleanRefundId || existingRec.gateway_refund_id;
      existingRec.amount = amount;
      existingRec.status = status;
      existingRec.gateway_status = status;
      existingRec.error_message = status === "failed" ? args.p_error_message || null : null;
      existingRec.attempt_count =
        status === "pending" || status === "processing"
          ? Number(existingRec.attempt_count || 1) + 1
          : existingRec.attempt_count || 1;
      existingRec.processed_at = status === "processed" ? existingRec.processed_at || nowIso : null;
      existingRec.updated_at = nowIso;
      recId = existingRec.id;
    } else {
      recId = this.nextUuid();
      this.refund_records.set(recId, {
        id: recId,
        order_id: order.id,
        return_request_id: null,
        gateway_refund_id: cleanRefundId,
        amount,
        currency: "INR",
        status,
        gateway_status: status,
        reason: args.p_reason || "Order refund",
        authorized_by: args.p_authorized_by || null,
        refund_type: args.p_refund_type || "cancellation",
        idempotency_key: args.p_idempotency_key || null,
        attempt_count: 1,
        error_message: status === "failed" ? args.p_error_message || null : null,
        raw_response: args.p_raw_response || {},
        processed_at: status === "processed" ? nowIso : null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    const effectiveSettled = status === "processed" ? existingSettled + amount : existingSettled;
    let targetPayStatus: string;
    if (status === "processed") {
      targetPayStatus =
        effectiveSettled >= Number(order.total_amount) - 0.01 ? "Refunded" : "Partially Refunded";
    } else if (status === "pending" || status === "processing") {
      targetPayStatus = "Refund Pending";
    } else {
      targetPayStatus = existingSettled > 0 ? "Partially Refunded" : "Paid";
    }

    order.payment_status = targetPayStatus;
    if (cleanRefundId) order.razorpay_refund_id = cleanRefundId;
    order.refund_status = status;
    order.refund_amount = effectiveSettled > 0 ? effectiveSettled : amount;
    if (status === "processed") order.refunded_at = nowIso;
    order.updated_at = nowIso;

    const payment = Array.from(this.payments.values()).find((p) => p.order_id === order.id && p.status !== "Failed");
    if (payment) {
      payment.status = targetPayStatus;
      if (cleanRefundId) payment.refund_id = cleanRefundId;
      payment.refund_status = status;
      payment.refund_amount = order.refund_amount;
      if (status === "processed") payment.refunded_at = nowIso;
    }

    return {
      success: true,
      status,
      order_id: order.id,
      refund_id: cleanRefundId,
      refund_record_id: recId,
      payment_status: targetPayStatus,
      cumulative_refunded: effectiveSettled,
    };
  }

  private rpcReleaseExpiredReservationsAtomic(args: any) {
    const limit = Math.max(1, Math.min(500, Number(args.p_limit || 50)));
    const now = new Date();
    const nowIso = now.toISOString();
    const releasedOrderIds: string[] = [];

    for (const order of Array.from(this.orders.values()).sort((a, b) => a.id.localeCompare(b.id))) {
      if (releasedOrderIds.length >= limit) break;
      if (
        order.payment_method !== "ONLINE" ||
        order.is_paid ||
        order.payment_status !== "Pending" ||
        order.order_status !== "Pending"
      ) {
        continue;
      }

      const hasPaidPayment = Array.from(this.payments.values()).some(
        (p) => p.order_id === order.id && p.status === "Paid"
      );
      if (hasPaidPayment) continue;

      const expiredRes = this.inventory_reservations.filter(
        (r) =>
          r.order_id === order.id &&
          r.status === "reserved" &&
          r.expires_at &&
          new Date(r.expires_at) < now
      );
      if (expiredRes.length === 0) continue;

      for (const res of expiredRes) {
        const book = this.books.get(res.book_id);
        if (book) book.stock += res.quantity;
        res.status = "expired";
        res.expired_at = nowIso;
        res.released_at = nowIso;
        res.release_reason = "reservation_expired";
      }

      if (order.coupon_status === "reserved" && order.coupon_code) {
        const coupon = Array.from(this.discounts.values()).find(
          (d) => String(d.code).toUpperCase() === String(order.coupon_code).toUpperCase()
        );
        if (coupon) coupon.used_count = Math.max(0, coupon.used_count - 1);
        order.coupon_status = "released";
      }

      order.order_status = "Cancelled";
      order.payment_status = "Failed";
      order.refund_status = "not_required";
      order.cancel_reason = "Payment reservation expired";
      order.expired_at = nowIso;

      for (const att of this.payment_attempts) {
        if (att.order_id === order.id && (att.status === "initiated" || att.status === "pending")) {
          att.status = "expired";
        }
      }

      releasedOrderIds.push(order.id);
    }

    return {
      success: true,
      released_orders_count: releasedOrderIds.length,
      order_ids: releasedOrderIds,
    };
  }
}

class SimQueryBuilder {
  private filters: Array<(row: any) => boolean> = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: any = null;
  private sortCol: string | null = null;
  private sortAsc = true;
  private maxRows: number | null = null;

  constructor(private sim: OfflinePostgresSimulator, private table: string) {}

  select(_cols = "*") {
    return this;
  }

  eq(col: string, val: any) {
    this.filters.push((r) => r?.[col] === val);
    return this;
  }

  neq(col: string, val: any) {
    this.filters.push((r) => r?.[col] !== val);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.sortCol = col;
    this.sortAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number) {
    this.maxRows = n;
    return this;
  }

  insert(data: any) {
    this.op = "insert";
    this.payload = data;
    return this.execute();
  }

  update(data: any) {
    this.op = "update";
    this.payload = data;
    return this;
  }

  async single() {
    const res = await this.execute();
    if (res.error) return res;
    if (!Array.isArray(res.data) || res.data.length !== 1) {
      return { data: null, error: { message: `Row not found in ${this.table}` } };
    }
    return { data: res.data[0], error: null };
  }

  async maybeSingle() {
    const res = await this.execute();
    if (res.error) return res;
    return { data: res.data?.[0] || null, error: null };
  }

  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
  }

  private getRowsArray(): any[] {
    switch (this.table) {
      case "addresses":
        return Array.from(this.sim.addresses.values());
      case "orders":
        return Array.from(this.sim.orders.values());
      case "payments":
        return Array.from(this.sim.payments.values());
      case "refund_records":
        return Array.from(this.sim.refund_records.values());
      case "webhook_events":
        return Array.from(this.sim.webhook_events.values());
      case "payment_attempts":
        return this.sim.payment_attempts;
      case "audit_logs":
        return this.sim.audit_logs;
      default:
        return [];
    }
  }

  private async execute(): Promise<{ data: any; error: any }> {
    if (this.op === "insert") {
      const now = new Date().toISOString();
      const row = { id: this.sim.nextUuid(), created_at: now, updated_at: now, ...this.payload };
      if (this.table === "payments") this.sim.payments.set(row.id, row);
      else if (this.table === "webhook_events") this.sim.webhook_events.set(row.id, row);
      else if (this.table === "payment_attempts") this.sim.payment_attempts.push(row);
      else if (this.table === "audit_logs") this.sim.audit_logs.push(row);
      else if (this.table === "refund_records") this.sim.refund_records.set(row.id, row);
      return { data: row, error: null };
    }

    const matches = this.getRowsArray().filter((r) => this.filters.every((fn) => fn(r)));

    if (this.op === "update") {
      for (const r of matches) {
        Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
      }
      return { data: matches, error: null };
    }

    let out = [...matches];
    if (this.sortCol) {
      const col = this.sortCol;
      out.sort((a, b) => {
        const va = String(a?.[col] ?? "");
        const vb = String(b?.[col] ?? "");
        return this.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    if (this.maxRows !== null) {
      out = out.slice(0, this.maxRows);
    }
    return { data: out, error: null };
  }
}

class SimSupabaseClient {
  constructor(private sim: OfflinePostgresSimulator, private role: DbRole) {}

  from(table: string) {
    return new SimQueryBuilder(this.sim, table);
  }

  async rpc(name: string, args: any = {}): Promise<{ data: any; error: { message: string } | null }> {
    try {
      const data = this.sim.callRpc(name, args, this.role);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || String(err) } };
    }
  }
}

// ---------------------------------------------------------------------------
// Test Helpers & Env Setup
// ---------------------------------------------------------------------------
function setEnv(key: string, value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else Reflect.set(process.env, key, value);
}

function setupSafeOfflineEnv(opts: { delhivery?: "enabled" | "disabled" | "mock"; razorpay?: "sandbox" | "mock" | "disabled" } = {}) {
  setEnv("NODE_ENV", "test");
  setEnv("APP_ENV", "test");
  setEnv("NEXT_PUBLIC_APP_ENV", "test");
  setEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  setEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig");
  setEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig");
  setEnv("ENABLE_EMAILS", "false");
  setEnv("ENABLE_CLOUDINARY", "false");
  setEnv("CRON_SECRET", "offline-test-cron-secret-32-bytes-min");

  const rzpMode = opts.razorpay ?? "sandbox";
  const delhMode = opts.delhivery ?? "enabled";
  setEnv("ALLOW_MOCK_SERVICES", rzpMode === "mock" || delhMode === "mock" ? "true" : "false");

  if (rzpMode === "sandbox") {
    setEnv("ENABLE_RAZORPAY", "true");
    setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_offline123456");
    setEnv("RAZORPAY_KEY_SECRET", "test_secret_offline_value_123");
    setEnv("RAZORPAY_WEBHOOK_SECRET", "whsec_test_offline_secret_123");
  } else if (rzpMode === "mock") {
    setEnv("ENABLE_RAZORPAY", undefined);
    setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", undefined);
    setEnv("RAZORPAY_KEY_SECRET", undefined);
    setEnv("RAZORPAY_WEBHOOK_SECRET", undefined);
  } else {
    setEnv("ENABLE_RAZORPAY", "false");
    setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", undefined);
    setEnv("RAZORPAY_KEY_SECRET", undefined);
    setEnv("RAZORPAY_WEBHOOK_SECRET", undefined);
  }

  if (delhMode === "enabled") {
    setEnv("ENABLE_DELHIVERY", "true");
    setEnv("DELHIVERY_API_URL", "https://staging-express.delhivery.com");
    setEnv("DELHIVERY_TOKEN", "staging_delhivery_token_offline");
    setEnv("DELHIVERY_WEBHOOK_SECRET", "staging_delhivery_webhook_secret_offline");
  } else if (delhMode === "mock") {
    setEnv("ENABLE_DELHIVERY", undefined);
    setEnv("DELHIVERY_TOKEN", undefined);
    setEnv("DELHIVERY_WEBHOOK_SECRET", undefined);
  } else {
    setEnv("ENABLE_DELHIVERY", "false");
    setEnv("DELHIVERY_TOKEN", undefined);
    setEnv("DELHIVERY_WEBHOOK_SECRET", undefined);
  }
}

function seedFixtureStore() {
  const sim = new OfflinePostgresSimulator();
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";
  const adminUser = "99999999-9999-4999-8999-999999999999";
  const addrA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const addrB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const book1 = "c1111111-1111-4111-8111-111111111111";
  const book2 = "c2222222-2222-4222-8222-222222222222";

  sim.profiles.set(userA, { id: userA, name: "Amina", role: "user", is_blocked: false, is_deleted: false });
  sim.profiles.set(userB, { id: userB, name: "Bilal", role: "user", is_blocked: false, is_deleted: false });
  sim.profiles.set(adminUser, { id: adminUser, name: "Admin", role: "admin", is_blocked: false, is_deleted: false });

  sim.addresses.set(addrA, {
    id: addrA,
    user_id: userA,
    full_name: "Amina Real Address",
    phone: "9876543210",
    house_no: "42B",
    area: "Okhla",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110025",
    landmark: "Near Masjid",
    address_type: "Home",
  });

  sim.addresses.set(addrB, {
    id: addrB,
    user_id: userB,
    full_name: "Bilal Address",
    phone: "9123456789",
    house_no: "99",
    area: "Bandra",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400050",
    landmark: null,
    address_type: "Home",
  });

  sim.books.set(book1, {
    id: book1,
    title: "Riyad-us-Saliheen",
    price: 500,
    discount: 10, // Effective: 450
    stock: 10,
    is_active: true,
    image_url: "https://example.com/book1.jpg",
  });

  sim.books.set(book2, {
    id: book2,
    title: "Tafsir Ibn Kathir",
    price: 1200,
    discount: 0,
    stock: 3,
    is_active: true,
    image_url: "https://example.com/book2.jpg",
  });

  sim.discounts.set("SAVE50", {
    id: "d1111111-1111-4111-8111-111111111111",
    code: "SAVE50",
    is_active: true,
    discount_type: "fixed",
    discount_value: 50,
    min_order_amount: 200,
    max_discount_amount: null,
    usage_limit: 5,
    used_count: 0,
  });

  const cartAId = "cart-a";
  sim.carts.set(cartAId, { id: cartAId, user_id: userA });
  sim.cart_items.push({ id: "ci-1", cart_id: cartAId, book_id: book1, quantity: 2, price: 450 });

  return { sim, userA, userB, adminUser, addrA, addrB, book1, book2, cartAId };
}

async function runTests() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  let delhiveryModeBehavior: "cod_yes" | "cod_no" | "unserviceable" | "http_503" | "timeout" | "malformed" =
    "cod_yes";
  let delhiveryFetchCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("delhivery.com")) {
      delhiveryFetchCount++;
      if (delhiveryModeBehavior === "timeout") {
        return await new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      if (delhiveryModeBehavior === "http_503") {
        return new Response(JSON.stringify({ error: "Service Unavailable" }), { status: 503 });
      }
      if (delhiveryModeBehavior === "malformed") {
        return new Response("<html>Bad Gateway</html>", { status: 200 });
      }
      if (delhiveryModeBehavior === "unserviceable") {
        return new Response(JSON.stringify({ delivery_codes: [] }), { status: 200 });
      }
      if (delhiveryModeBehavior === "cod_no") {
        return new Response(
          JSON.stringify({
            delivery_codes: [{ postal_code: { pre_paid: "Y", cod: "N", is_serviceable: true, city: "New Delhi" } }],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          delivery_codes: [{ postal_code: { pre_paid: "Y", cod: "Y", is_serviceable: true, city: "New Delhi" } }],
        }),
        { status: 200 }
      );
    }
    throw new Error(`Blocked real outbound network call in offline test suite: ${url}`);
  }) as typeof fetch;

  let passed = 0;
  async function testCase(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  console.log("=== PHASE 02 OFFLINE VERIFICATION: CHECKOUT HARDENING ===\n");

  try {
    // =========================================================================
    // C-1: ONLINE ORDER CANCELLATION & RAZORPAY REFUNDS
    // =========================================================================
    await testCase("C-1.1: Paid ONLINE cancellation calls Razorpay once, records real refund & restores stock", async () => {
      setupSafeOfflineEnv({ razorpay: "sandbox", delhivery: "mock" });
      const { sim, userA, adminUser, addrA, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");
      let rzpOrderCounter = 1;
      let rzpRefundCalls = 0;

      const mockRzpClient = {
        orders: {
          create: async () => ({ id: `rzp_ord_${rzpOrderCounter++}` }),
        },
        payments: {
          fetch: async (payId: string) => ({
            id: payId,
            order_id: "rzp_ord_1",
            status: "captured",
            amount: 94500,
            amount_refunded: 0,
            currency: "INR",
          }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async (_payId: string, opts: any) => {
            rzpRefundCalls++;
            return { id: `rfnd_live_${rzpRefundCalls}`, status: "processed", amount: opts.amount };
          },
        },
        refunds: { fetch: async () => ({ status: "processed" }) },
      };

      const checkoutRes = await executeOrderCheckout(
        {
          paymentMethod: "ONLINE",
          addressId: addrA,
          idempotencyKey: "key-c1-1",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: async () => ({
            cartId: "cart-a",
            items: [{ id: "ci-1", cartId: "cart-a", bookId: book1, quantity: 2, price: 450, title: "Riyad", author: "Nawawi", imageUrl: "", stock: 10, isActive: true, lineTotal: 900 }],
            subtotal: 900,
            platformFee: 10,
            deliveryFee: 35,
            totalAmount: 945,
            itemCount: 2,
          }),
          createRazorpayOrderFn: (orderId, uid, opts) =>
            createRazorpayOrder(orderId, uid, { ...opts, adminDb, razorpayClient: mockRzpClient }),
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
          sendOrderEmailsFn: async () => ({ success: true }),
          sendAdminAlertFn: async () => ({ success: true }),
          checkLowStockFn: async () => ({ triggeredCount: 0, alerts: [] }),
        }
      );

      assert.equal(checkoutRes.success, true);
      const orderId = checkoutRes.orderId!;
      assert.equal(sim.books.get(book1)!.stock, 8);

      const sig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update("rzp_ord_1|pay_c1_1")
        .digest("hex");

      await verifyAndSettlePayment(
        { razorpay_order_id: "rzp_ord_1", razorpay_payment_id: "pay_c1_1", razorpay_signature: sig, userId: userA },
        { adminDb, razorpayClient: mockRzpClient }
      );
      assert.equal(sim.orders.get(orderId)!.payment_status, "Paid");

      const cancelRes = await executeOrderCancellation(
        { orderId, actorUserId: adminUser, reason: "Customer requested cancellation", isAdmin: true },
        {
          adminDb,
          initiateRefundFn: (p) => initiateRazorpayRefund(p, { adminDb, razorpayClient: mockRzpClient }),
          sendOrderEmailsFn: async () => ({ success: true }),
        }
      );

      assert.equal(cancelRes.success, true);
      assert.equal(cancelRes.refundStatus, "PROCESSED");
      assert.equal(rzpRefundCalls, 1);
      assert.equal(sim.books.get(book1)!.stock, 10);
      const ord = sim.orders.get(orderId)!;
      assert.equal(ord.order_status, "Cancelled");
      assert.equal(ord.payment_status, "Refunded");
      assert.equal(ord.refund_status, "processed");
      assert.equal(ord.razorpay_refund_id, "rfnd_live_1");
    });

    await testCase("C-1.2: Regression — Refund Pending without gateway refund ID still calls Razorpay", async () => {
      setupSafeOfflineEnv({ razorpay: "sandbox", delhivery: "mock" });
      const { sim, userA, addrA, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");
      let calledGateway = false;

      const mockRzpClient = {
        orders: { create: async () => ({ id: "rzp_ord_reg" }) },
        payments: {
          fetch: async () => ({ id: "pay_reg", order_id: "rzp_ord_reg", status: "captured", amount: 94500, amount_refunded: 0 }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async () => {
            calledGateway = true;
            return { id: "rfnd_reg_1", status: "processed" };
          },
        },
      };

      const orderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 2 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
      })).data;

      await createRazorpayOrder(orderId, userA, { adminDb, razorpayClient: mockRzpClient });
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_reg",
        p_razorpay_payment_id: "pay_reg",
        p_signature: "s",
        p_raw_response: { amount: 94500, currency: "INR" },
      });

      // Simulate customer cancellation RPC transition BEFORE refund call
      await adminDb.rpc("cancel_order_atomic", {
        p_order_id: orderId,
        p_user_id: userA,
        p_cancel_reason: "Customer cancel",
        p_is_admin: false,
      });

      assert.equal(sim.orders.get(orderId)!.payment_status, "Refund Pending");
      assert.equal(sim.orders.get(orderId)!.refund_status, "pending");
      assert.equal(sim.orders.get(orderId)!.razorpay_refund_id, null);

      const res = await initiateRazorpayRefund({ orderId, reason: "Customer cancel" }, { adminDb, razorpayClient: mockRzpClient });
      assert.equal(calledGateway, true, "Must call Razorpay even when order is Refund Pending without gateway ID");
      assert.equal(res.success, true);
      assert.equal(res.refundId, "rfnd_reg_1");
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refunded");
    });

    await testCase("C-1.3: Async pending refund -> PROCESSING -> webhook refund.processed -> PROCESSED (no false completion)", async () => {
      setupSafeOfflineEnv({ razorpay: "sandbox", delhivery: "mock" });
      const { sim, userA, addrA, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");

      const mockRzpClient = {
        orders: { create: async () => ({ id: "rzp_ord_async" }) },
        payments: {
          fetch: async () => ({ id: "pay_async", order_id: "rzp_ord_async", status: "captured", amount: 94500, amount_refunded: 0 }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async () => ({ id: "rfnd_async_1", status: "pending" }),
        },
        refunds: { fetch: async () => ({ id: "rfnd_async_1", status: "pending" }) },
      };

      const orderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 2 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
      })).data;
      await createRazorpayOrder(orderId, userA, { adminDb, razorpayClient: mockRzpClient });
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_async",
        p_razorpay_payment_id: "pay_async",
        p_signature: "sig",
        p_raw_response: { amount: 94500, currency: "INR" },
      });

      const cancelRes = await executeOrderCancellation(
        { orderId, actorUserId: userA, reason: "Changed mind", isAdmin: false },
        {
          adminDb,
          initiateRefundFn: (p) => initiateRazorpayRefund(p, { adminDb, razorpayClient: mockRzpClient }),
          sendOrderEmailsFn: async () => ({ success: true }),
        }
      );

      assert.equal(cancelRes.success, true);
      assert.equal(cancelRes.refundStatus, "PROCESSING");
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refund Pending");
      assert.equal(sim.orders.get(orderId)!.refund_status, "processing");

      // Webhook refund.processed confirms final settlement
      const whBody = JSON.stringify({
        id: "evt_rfnd_proc_1",
        event: "refund.processed",
        payload: {
          refund: { entity: { id: "rfnd_async_1", payment_id: "pay_async", amount: 94500, status: "processed" } },
          payment: { entity: { id: "pay_async", order_id: "rzp_ord_async" } },
        },
      });
      const whSig = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(whBody).digest("hex");
      const whRes = await processRazorpayWebhook(whBody, whSig, { adminDb, razorpayClient: mockRzpClient });
      assert.equal(whRes.status, "refund_recorded");
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refunded");
      assert.equal(sim.orders.get(orderId)!.refund_status, "processed");

      // Out-of-order refund.failed cannot downgrade PROCESSED refund
      const failWh = JSON.stringify({
        id: "evt_rfnd_fail_late",
        event: "refund.failed",
        payload: {
          refund: { entity: { id: "rfnd_async_1", payment_id: "pay_async", amount: 94500 } },
        },
      });
      const failSig = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(failWh).digest("hex");
      await processRazorpayWebhook(failWh, failSig, { adminDb, razorpayClient: mockRzpClient });
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refunded");
      assert.equal(sim.orders.get(orderId)!.refund_status, "processed");
    });

    await testCase("C-1.4: Razorpay failure/timeout does not report refund success, stores no synthetic rfnd_err_*, and recovers safely via retry", async () => {
      setupSafeOfflineEnv({ razorpay: "sandbox", delhivery: "mock" });
      const { sim, userA, adminUser, addrA, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");
      let shouldTimeout = true;
      let recoveredViaList = false;

      const mockRzpClient = {
        orders: { create: async () => ({ id: "rzp_ord_fail" }) },
        payments: {
          fetch: async () => ({ id: "pay_fail", order_id: "rzp_ord_fail", status: "captured", amount: 94500, amount_refunded: 0 }),
          fetchMultipleRefund: async () => {
            if (!shouldTimeout && recoveredViaList) {
              const firstRec = Array.from(sim.refund_records.values())[0];
              const receipt = `rcpt_${crypto.createHash("sha256").update(firstRec.idempotency_key).digest("hex").slice(0, 32)}`;
              return { items: [{ id: "rfnd_recovered_gateway_1", status: "processed", receipt, amount: 94500 }] };
            }
            return { items: [] };
          },
          refund: async () => {
            if (shouldTimeout) {
              return new Promise((resolve) => setTimeout(() => resolve({ id: "too_late" }), 100));
            }
            return { id: "rfnd_should_not_duplicate", status: "processed" };
          },
        },
      };

      const orderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 2 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
      })).data;
      await createRazorpayOrder(orderId, userA, { adminDb, razorpayClient: mockRzpClient });
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_fail",
        p_razorpay_payment_id: "pay_fail",
        p_signature: "sig",
        p_raw_response: { amount: 94500, currency: "INR" },
      });

      const cancelFail = await executeOrderCancellation(
        { orderId, actorUserId: adminUser, reason: "Out of stock", isAdmin: true },
        {
          adminDb,
          initiateRefundFn: (p) =>
            initiateRazorpayRefund(p, { adminDb, razorpayClient: mockRzpClient, timeoutMs: 20 }),
          sendOrderEmailsFn: async () => ({ success: true }),
        }
      );

      assert.equal(cancelFail.success, false, "Admin cancel must NOT return success=true when refund fails");
      assert.equal(cancelFail.orderCancelled, true);
      assert.equal(cancelFail.refundStatus, "FAILED");
      assert.equal(sim.orders.get(orderId)!.razorpay_refund_id, null, "Must never store synthetic rfnd_err_*");
      assert.equal(sim.orders.get(orderId)!.refund_status, "failed");

      // Retry reconciles existing gateway refund found via fetchMultipleRefund without double-refunding
      shouldTimeout = false;
      recoveredViaList = true;
      const retryRes = await executeAdminRefundRetry(
        { orderId, adminUserId: adminUser },
        {
          adminDb,
          initiateRefundFn: (p) => initiateRazorpayRefund(p, { adminDb, razorpayClient: mockRzpClient }),
        }
      );

      assert.equal(retryRes.success, true);
      assert.equal(retryRes.refundId, "rfnd_recovered_gateway_1");
      assert.equal(retryRes.refundStatus, "PROCESSED");
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refunded");
    });

    await testCase("C-1.5: Payment eligibility (reject authorized-only), partial refund caps, and COD NOT_REQUIRED", async () => {
      setupSafeOfflineEnv({ razorpay: "sandbox", delhivery: "mock" });
      const { sim, userA, addrA, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");

      // 1. Authorized-only payment cannot be refunded
      const authOnlyClient = {
        orders: { create: async () => ({ id: "rzp_ord_auth" }) },
        payments: {
          fetch: async () => ({ id: "pay_auth", order_id: "rzp_ord_auth", status: "authorized", amount: 94500 }),
          refund: async () => {
            throw new Error("Must never call refund for authorized-only payment");
          },
        },
      };

      const orderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 2 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
      })).data;
      await createRazorpayOrder(orderId, userA, { adminDb, razorpayClient: authOnlyClient });
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_auth",
        p_razorpay_payment_id: "pay_auth",
        p_signature: "sig",
        p_raw_response: { amount: 94500, currency: "INR" },
      });

      const authErr = await initiateRazorpayRefund({ orderId }, { adminDb, razorpayClient: authOnlyClient });
      assert.equal(authErr.success, false);
      assert.equal(authErr.status, "not_eligible");

      // 2. Partial refund & cumulative cap
      let partialCounter = 0;
      const partialClient = {
        payments: {
          fetch: async () => ({ id: "pay_auth", order_id: "rzp_ord_auth", status: "captured", amount: 94500, amount_refunded: partialCounter === 1 ? 30000 : 0 }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async (_id: string, body: any) => {
            partialCounter++;
            return { id: `rfnd_part_${partialCounter}`, status: "processed", amount: body.amount };
          },
        },
      };

      const p1 = await initiateRazorpayRefund(
        { orderId, amount: 300, idempotencyKey: "part-1", reason: "Partial 1" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(p1.success, true);
      assert.equal(sim.orders.get(orderId)!.payment_status, "Partially Refunded");

      const excess = await initiateRazorpayRefund(
        { orderId, amount: 700, idempotencyKey: "part-excess", reason: "Excess" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(excess.success, false);
      assert.equal(excess.status, "not_eligible");

      const p2 = await initiateRazorpayRefund(
        { orderId, amount: 645, idempotencyKey: "part-2", reason: "Remaining" },
        { adminDb, razorpayClient: partialClient }
      );
      assert.equal(p2.success, true);
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refunded");
      assert.equal(mapDbRefundStatusToLifecycle(sim.orders.get(orderId)!.refund_status), "PROCESSED");
    });

    // =========================================================================
    // H-1: COD SERVICEABILITY FAIL-CLOSED BEHAVIOUR
    // =========================================================================
    await testCase("H-1.1: COD strictly fails closed when Delhivery disabled, 503, timeout, malformed, unserviceable, or prepaid-only", async () => {
      clearPincodeServiceabilityCache();
      delhiveryFetchCount = 0;

      // Case A: Disabled Delhivery
      setupSafeOfflineEnv({ delhivery: "disabled", razorpay: "mock" });
      const disabledCheck = await verifyCodServiceabilityStrict("110025", { skipCache: true });
      assert.equal(disabledCheck.eligible, false);
      assert.equal(disabledCheck.code, "DELHIVERY_UNAVAILABLE");

      // Case B: Enabled + HTTP 503 / timeout / malformed / unserviceable / cod=N -> ALL FAIL CLOSED
      setupSafeOfflineEnv({ delhivery: "enabled", razorpay: "mock" });
      for (const mode of ["http_503", "timeout", "malformed", "unserviceable", "cod_no"] as const) {
        clearPincodeServiceabilityCache();
        delhiveryModeBehavior = mode;
        const { sim, userA, addrA, book1 } = seedFixtureStore();
        const adminDb = sim.clientFor("service_role");
        const initialStock = sim.books.get(book1)!.stock;

        const codOrderRes = await executeOrderCheckout(
          {
            paymentMethod: "COD",
            addressId: addrA,
            idempotencyKey: `key-cod-fail-${mode}`,
            consent: { termsAccepted: true },
          },
          {
            user: { id: userA },
            adminDb,
            getCart: async () => ({
              cartId: "cart-a",
              items: [{ id: "ci-1", cartId: "cart-a", bookId: book1, quantity: 1, price: 450, title: "Riyad", author: "Nawawi", imageUrl: "", stock: 10, isActive: true, lineTotal: 450 }],
              subtotal: 450,
              platformFee: 10,
              deliveryFee: 35,
              totalAmount: 495,
              itemCount: 1,
            }),
            verifyCodServiceability: (pin) =>
              verifyCodServiceabilityStrict(pin, { timeoutMs: 25, skipCache: true }),
            checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
          }
        );

        assert.equal(codOrderRes.success, false, `Expected COD to fail closed on ${mode}`);
        assert.equal(sim.orders.size, 0, `No COD order should be created on ${mode}`);
        assert.equal(sim.books.get(book1)!.stock, initialStock, `Stock must remain intact on ${mode}`);
      }

      // Check API route status codes when disabled / timeout
      setupSafeOfflineEnv({ delhivery: "disabled" });
      const routeDisabledRes = await serviceabilityRouteGet(
        new Request("http://localhost/api/shipping/serviceability?pincode=110025")
      );
      assert.equal(routeDisabledRes.status, 503);
      const disabledBody = await routeDisabledRes.json();
      assert.equal(disabledBody.cod, false);
      assert.equal(disabledBody.serviceable, false);
    });

    await testCase("H-1.2: Positive COD cache hits safely within TTL; unserviceable/errors never cached; ONLINE stays independent", async () => {
      setupSafeOfflineEnv({ delhivery: "enabled", razorpay: "mock" });
      clearPincodeServiceabilityCache();
      delhiveryFetchCount = 0;

      // Error must NOT be cached
      delhiveryModeBehavior = "http_503";
      await assert.rejects(() => checkPincodeServiceability("110025"));
      delhiveryModeBehavior = "cod_yes";
      const freshOk = await checkPincodeServiceability("110025");
      assert.equal(freshOk.serviceable, true);
      assert.equal(freshOk.cod, true);
      assert.equal(freshOk.cached, false);
      assert.equal(delhiveryFetchCount, 2);

      // Subsequent positive lookup uses short TTL cache
      const cachedOk = await checkPincodeServiceability("110025");
      assert.equal(cachedOk.cached, true);
      assert.equal(delhiveryFetchCount, 2);

      // Unserviceable pin (e.g. 999999) is NEVER cached across checks
      delhiveryModeBehavior = "unserviceable";
      const unsvc1 = await checkPincodeServiceability("999999");
      assert.equal(unsvc1.serviceable, false);
      delhiveryModeBehavior = "cod_yes";
      const unsvcNowOk = await checkPincodeServiceability("999999");
      assert.equal(unsvcNowOk.serviceable, true);

      // Online checkout succeeds even when Delhivery is disabled
      setupSafeOfflineEnv({ delhivery: "disabled", razorpay: "mock" });
      const { sim, userA, addrA, book1 } = seedFixtureStore();
      sim.cart_items[0].quantity = 1;
      const adminDb = sim.clientFor("service_role");
      const onlineWhenDelhiveryDown = await executeOrderCheckout(
        {
          paymentMethod: "ONLINE",
          addressId: addrA,
          idempotencyKey: "key-online-independent",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: async () => ({
            cartId: "cart-a",
            items: [{ id: "ci-1", cartId: "cart-a", bookId: book1, quantity: 1, price: 450, title: "Riyad", author: "Nawawi", imageUrl: "", stock: 10, isActive: true, lineTotal: 450 }],
            subtotal: 450,
            platformFee: 10,
            deliveryFee: 35,
            totalAmount: 495,
            itemCount: 1,
          }),
          createRazorpayOrderFn: (id, uid, opts) => createRazorpayOrder(id, uid, { ...opts, adminDb }),
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
          sendOrderEmailsFn: async () => ({ success: true }),
          sendAdminAlertFn: async () => ({ success: true }),
          checkLowStockFn: async () => ({ triggeredCount: 0, alerts: [] }),
        }
      );
      assert.equal(onlineWhenDelhiveryDown.success, true, JSON.stringify(onlineWhenDelhiveryDown));

      // Valid COD check when Delhivery returns cod=Y & serviceable=true succeeds cleanly
      setupSafeOfflineEnv({ delhivery: "enabled", razorpay: "mock" });
      delhiveryModeBehavior = "cod_yes";
      clearPincodeServiceabilityCache();
      const sim2 = seedFixtureStore();
      sim2.sim.cart_items[0].quantity = 1;
      const validCod = await executeOrderCheckout(
        {
          paymentMethod: "COD",
          addressId: sim2.addrA,
          idempotencyKey: "key-cod-valid",
          consent: { termsAccepted: true },
        },
        {
          user: { id: sim2.userA },
          adminDb: sim2.sim.clientFor("service_role"),
          getCart: async () => ({
            cartId: sim2.cartAId,
            items: [{ id: "ci-1", cartId: sim2.cartAId, bookId: sim2.book1, quantity: 1, price: 450, title: "Riyad", author: "Nawawi", imageUrl: "", stock: 10, isActive: true, lineTotal: 450 }],
            subtotal: 450,
            platformFee: 10,
            deliveryFee: 35,
            totalAmount: 495,
            itemCount: 1,
          }),
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
          sendOrderEmailsFn: async () => ({ success: true }),
          sendAdminAlertFn: async () => ({ success: true }),
          checkLowStockFn: async () => ({ triggeredCount: 0, alerts: [] }),
        }
      );
      assert.equal(validCod.success, true);
      assert.equal(sim2.sim.orders.get(validCod.orderId!)!.cod_serviceability_verified, true);
    });

    // =========================================================================
    // H-3: EXPIRED ONLINE RESERVATIONS & CRON CLEANUP
    // =========================================================================
    await testCase("H-3.1: Expired unpaid ONLINE reservations restore stock & coupons idempotently; Paid/COD/Active stay untouched", async () => {
      setupSafeOfflineEnv({ razorpay: "mock", delhivery: "mock" });
      const { sim, userA, userB, addrA, addrB, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");

      // Order 1: Expired unpaid ONLINE with coupon SAVE50
      const expiredOrdId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 3 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
        p_coupon_code: "SAVE50",
      })).data;

      // Order 2: Paid ONLINE (must never expire even if reservation timestamp manipulated)
      const paidOrdId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userB,
        p_items: [{ book_id: book1, quantity: 2 }],
        p_address_id: addrB,
        p_payment_method: "ONLINE",
      })).data;
      await createRazorpayOrder(paidOrdId, userB, { adminDb });
      const paidOrd = sim.orders.get(paidOrdId)!;
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: paidOrd.razorpay_order_id,
        p_razorpay_payment_id: "pay_keep_paid",
        p_signature: "sig",
        p_raw_response: { amount: paidOrd.total_amount * 100, currency: "INR" },
      });

      // Order 3: Active unexpired COD
      const codOrdId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userB,
        p_items: [{ book_id: book1, quantity: 1 }],
        p_address_id: addrB,
        p_payment_method: "COD",
        p_cod_verified: true,
      })).data;

      assert.equal(sim.books.get(book1)!.stock, 4); // 10 - 3 - 2 - 1 = 4
      assert.equal(sim.discounts.get("SAVE50")!.used_count, 1);

      // Force Order 1 reservation into the past
      const pastIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      for (const r of sim.inventory_reservations.filter((r) => r.order_id === expiredOrdId)) {
        r.expires_at = pastIso;
      }

      const run1 = await runReleaseExpiredReservationsWorker(50, { adminDb });
      assert.equal(run1.success, true);
      assert.equal(run1.releasedCount, 1);
      assert.deepEqual(run1.orderIds, [expiredOrdId]);
      assert.equal(sim.books.get(book1)!.stock, 7); // 4 + 3 restored
      assert.equal(sim.discounts.get("SAVE50")!.used_count, 0);
      assert.equal(sim.orders.get(expiredOrdId)!.order_status, "Cancelled");
      assert.equal(sim.orders.get(expiredOrdId)!.refund_status, "not_required");
      assert.equal(sim.orders.get(paidOrdId)!.order_status, "Confirmed");
      assert.equal(sim.orders.get(codOrdId)!.order_status, "Pending");

      // Repeated & concurrent executions must NOT double-restore stock or underflow coupon
      const [run2, run3] = await Promise.all([
        runReleaseExpiredReservationsWorker(50, { adminDb }),
        runReleaseExpiredReservationsWorker(50, { adminDb }),
      ]);
      assert.equal(run2.releasedCount, 0);
      assert.equal(run3.releasedCount, 0);
      assert.equal(sim.books.get(book1)!.stock, 7);
      assert.equal(sim.discounts.get("SAVE50")!.used_count, 0);
    });

    await testCase("H-3.2: Late payment capture after expiry triggers automatic refund when stock is gone; recovers when stock is available", async () => {
      setupSafeOfflineEnv({ razorpay: "sandbox", delhivery: "mock" });
      const { sim, userA, addrA, book2 } = seedFixtureStore(); // book2 stock = 3
      const adminDb = sim.clientFor("service_role");
      let autoRefundCount = 0;

      const rzpMock = {
        orders: { create: async () => ({ id: "rzp_ord_late" }) },
        payments: {
          fetch: async () => ({ id: "pay_late", order_id: "rzp_ord_late", status: "captured", amount: 244500, amount_refunded: 0 }),
          fetchMultipleRefund: async () => ({ items: [] }),
          refund: async () => {
            autoRefundCount++;
            return { id: `rfnd_auto_${autoRefundCount}`, status: "processed" };
          },
        },
      };

      const orderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book2, quantity: 2 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
      })).data;
      await createRazorpayOrder(orderId, userA, { adminDb, razorpayClient: rzpMock });

      // Expire order reservation
      for (const r of sim.inventory_reservations.filter((r) => r.order_id === orderId)) {
        r.expires_at = new Date(Date.now() - 1000).toISOString();
      }
      await runReleaseExpiredReservationsWorker(10, { adminDb });
      assert.equal(sim.books.get(book2)!.stock, 3);

      // Consume remaining stock so late capture cannot recover order
      sim.books.get(book2)!.stock = 1;

      const lateBody = JSON.stringify({
        id: "evt_late_capture",
        event: "payment.captured",
        payload: {
          payment: { entity: { id: "pay_late", order_id: "rzp_ord_late", currency: "INR", amount: 244500 } },
        },
      });
      const lateSig = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(lateBody).digest("hex");
      const whRes = await processRazorpayWebhook(lateBody, lateSig, { adminDb, razorpayClient: rzpMock });

      assert.equal(whRes.status, "refund_triggered");
      assert.equal(autoRefundCount, 1);
      assert.equal(sim.orders.get(orderId)!.payment_status, "Refunded");
      assert.equal(sim.orders.get(orderId)!.order_status, "Cancelled");
    });

    await testCase("H-3.3: Cron endpoint /api/cron/release-reservations fails closed without valid CRON_SECRET", async () => {
      setupSafeOfflineEnv();
      setEnv("CRON_SECRET", undefined);
      const unconfigured = await cronReleaseGet(
        new Request("http://localhost/api/cron/release-reservations")
      );
      assert.equal(unconfigured.status, 503);

      setEnv("CRON_SECRET", "super-secret-cron-token-minimum-32-chars");
      const unauth = await cronReleasePost(
        new Request("http://localhost/api/cron/release-reservations", {
          method: "POST",
          headers: { authorization: "Bearer wrong-token" },
        })
      );
      assert.equal(unauth.status, 401);
    });

    // =========================================================================
    // H-8: PAYMENT METHOD SWITCHING & IDEMPOTENCY
    // =========================================================================
    await testCase("H-8.1: Switching ONLINE <-> COD or changing address/coupon with same idempotencyKey rejects conflict cleanly; fresh key succeeds", async () => {
      setupSafeOfflineEnv({ delhivery: "mock", razorpay: "mock" });
      const { sim, userA, addrA, book1, cartAId } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");
      const cartMock = async () => ({
        cartId: cartAId,
        items: [{ id: "ci-1", cartId: cartAId, bookId: book1, quantity: 1, price: 450, title: "Riyad", author: "Nawawi", imageUrl: "", stock: 10, isActive: true, lineTotal: 450 }],
        subtotal: 450,
        platformFee: 10,
        deliveryFee: 35,
        totalAmount: 495,
        itemCount: 1,
      });

      const sharedCartItem = sim.cart_items.find((ci) => ci.cart_id === cartAId)!;
      sharedCartItem.quantity = 1;

      const onlineRes = await executeOrderCheckout(
        {
          paymentMethod: "ONLINE",
          addressId: addrA,
          idempotencyKey: "switch-test-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: cartMock,
          createRazorpayOrderFn: (id, uid, opts) => createRazorpayOrder(id, uid, { ...opts, adminDb }),
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
          checkLowStockFn: async () => ({ triggeredCount: 0, alerts: [] }),
        }
      );
      assert.equal(onlineRes.success, true);

      // Identical ONLINE retry returns exact same order (even though cart was cleared!)
      const sameOnlineRetry = await executeOrderCheckout(
        {
          paymentMethod: "ONLINE",
          addressId: addrA,
          idempotencyKey: "switch-test-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: async () => null,
          createRazorpayOrderFn: (id, uid, opts) => createRazorpayOrder(id, uid, { ...opts, adminDb }),
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
        }
      );
      assert.equal(sameOnlineRetry.success, true);
      assert.equal(sameOnlineRetry.orderId, onlineRes.orderId);
      assert.equal(sameOnlineRetry.reused, true);
      assert.equal(sameOnlineRetry.razorpayOrder?.razorpayOrderId, onlineRes.razorpayOrder?.razorpayOrderId);

      // Reusing SAME key while switching ONLINE -> COD MUST reject (never return the ONLINE order as COD!)
      const staleCodSwitch = await executeOrderCheckout(
        {
          paymentMethod: "COD",
          addressId: addrA,
          idempotencyKey: "switch-test-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: cartMock,
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
        }
      );
      assert.equal(staleCodSwitch.success, false);
      assert.equal(staleCodSwitch.code, "IDEMPOTENCY_CONFLICT");

      // Reusing SAME key while adding coupon MUST reject
      const couponSwitch = await executeOrderCheckout(
        {
          paymentMethod: "ONLINE",
          addressId: addrA,
          couponCode: "SAVE50",
          idempotencyKey: "switch-test-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: cartMock,
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
        }
      );
      assert.equal(couponSwitch.success, false);
      assert.equal(couponSwitch.code, "IDEMPOTENCY_CONFLICT");

      // Fresh key with COD works independently
      sim.cart_items.push({ id: "ci-2", cart_id: cartAId, book_id: book1, quantity: 1, price: 450 });
      const freshCodRes = await executeOrderCheckout(
        {
          paymentMethod: "COD",
          addressId: addrA,
          idempotencyKey: "fresh-cod-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: cartMock,
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
          sendOrderEmailsFn: async () => ({ success: true }),
          sendAdminAlertFn: async () => ({ success: true }),
          checkLowStockFn: async () => ({ triggeredCount: 0, alerts: [] }),
        }
      );
      assert.equal(freshCodRes.success, true);
      assert.notEqual(freshCodRes.orderId, onlineRes.orderId);
      assert.equal(sim.orders.get(freshCodRes.orderId!)!.payment_method, "COD");
    });

    await testCase("H-8.2: Retry payment reuses pending attempt, creates new attempt on forceNewAttempt, and rejects expired reservations", async () => {
      setupSafeOfflineEnv({ delhivery: "mock", razorpay: "mock" });
      const { sim, userA, addrA, book1 } = seedFixtureStore();
      const adminDb = sim.clientFor("service_role");

      const orderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 1 }],
        p_address_id: addrA,
        p_payment_method: "ONLINE",
      })).data;

      const att1 = await createRazorpayOrder(orderId, userA, { adminDb });
      const [retryReuseA, retryReuseB] = await Promise.all([
        executeRetryOrderPayment({ orderIdentifier: orderId, userId: userA }, { adminDb }),
        executeRetryOrderPayment({ orderIdentifier: orderId, userId: userA }, { adminDb }),
      ]);
      assert.equal(retryReuseA.success, true);
      assert.equal(retryReuseB.success, true);
      assert.equal(retryReuseA.razorpayOrder?.razorpayOrderId, att1.razorpayOrderId);
      assert.equal(retryReuseB.razorpayOrder?.razorpayOrderId, att1.razorpayOrderId);
      assert.equal(retryReuseA.razorpayOrder?.reused, true);

      const retryNew = await executeRetryOrderPayment(
        { orderIdentifier: orderId, userId: userA, forceNewAttempt: true },
        { adminDb }
      );
      assert.equal(retryNew.success, true);
      assert.notEqual(retryNew.razorpayOrder?.razorpayOrderId, att1.razorpayOrderId);
      assert.equal(retryNew.razorpayOrder?.attemptNumber, 2);

      // Once reservation expired & cancelled, retry fails cleanly
      for (const r of sim.inventory_reservations.filter((r) => r.order_id === orderId)) {
        r.expires_at = new Date(Date.now() - 1000).toISOString();
      }
      await runReleaseExpiredReservationsWorker(10, { adminDb });
      const expiredRetry = await executeRetryOrderPayment(
        { orderIdentifier: orderId, userId: userA },
        { adminDb }
      );
      assert.equal(expiredRetry.success, false);
    });

    // =========================================================================
    // H-2: SECURE ORDER CREATION RPC & PRIVATIZED EXECUTION BOUNDARIES
    // =========================================================================
    await testCase("H-2.1: Anon/authenticated callers blocked from direct RPCs; spoofed address & tampered prices defeated", async () => {
      setupSafeOfflineEnv({ delhivery: "mock", razorpay: "mock" });
      const { sim, userA, addrB, book1, cartAId } = seedFixtureStore();
      const anonDb = sim.clientFor("anon");
      const authDb = sim.clientFor("authenticated");
      const adminDb = sim.clientFor("service_role");

      for (const rpcName of [
        "create_order_atomic",
        "cancel_order_atomic",
        "record_order_consent_atomic",
        "settle_payment_atomic",
        "record_refund_atomic",
        "release_expired_reservations_atomic",
      ]) {
        const anonRes = await anonDb.rpc(rpcName, {});
        assert.match(anonRes.error?.message || "", /permission denied/);
        const authRes = await authDb.rpc(rpcName, {});
        assert.match(authRes.error?.message || "", /permission denied/);
      }

      // Spoofed address owned by userB rejected for userA
      const spoofedAddrRes = await executeOrderCheckout(
        {
          paymentMethod: "COD",
          addressId: addrB,
          idempotencyKey: "spoof-addr-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: async () => null,
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
        }
      );
      assert.equal(spoofedAddrRes.success, false);
      assert.equal(spoofedAddrRes.code, "INVALID_ADDRESS");

      // DB ignores forged p_total_amount / item price and computes 2*450 + 10 + 35 - 50 = 895
      const forgedRpcOrderId = (await adminDb.rpc("create_order_atomic", {
        p_user_id: userA,
        p_items: [{ book_id: book1, quantity: 2, price: 1 }], // Forged unit price = 1
        p_address_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_address_snapshot: { full_name: "Attacker", pincode: "000000" }, // Should be ignored!
        p_payment_method: "COD",
        p_total_amount: 1, // Forged total = 1
        p_coupon_code: "SAVE50",
        p_cod_verified: true,
        p_require_cart: true,
      })).data;

      const created = sim.orders.get(forgedRpcOrderId)!;
      assert.equal(created.total_amount, 895);
      assert.equal(created.subtotal, 900);
      assert.equal(created.discount_amount, 50);
      assert.equal(created.address_snapshot.full_name, "Amina Real Address");
      assert.equal(created.address_snapshot.pincode, "110025");

      // Second concurrent tab with empty cart cannot place duplicate order
      const secondTab = await executeOrderCheckout(
        {
          paymentMethod: "COD",
          addressId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          idempotencyKey: "tab-2-different-key",
          consent: { termsAccepted: true },
        },
        {
          user: { id: userA },
          adminDb,
          getCart: async () => ({
            cartId: cartAId,
            items: [],
            subtotal: 0,
            platformFee: 0,
            deliveryFee: 0,
            totalAmount: 0,
            itemCount: 0,
          }),
          checkRateLimitFn: async () => ({ allowed: true, limit: 15, remaining: 14, reset: Date.now() + 60000, current: 1, source: "memory" as const }),
        }
      );
      assert.equal(secondTab.success, false);
      assert.equal(secondTab.code, "EMPTY_CART");
    });

    await testCase("H-2.2: Static SQL migration & codebase RPC privilege audit", () => {
      const repoRoot = path.resolve(process.cwd(), "..", "..");
      const migPath = path.join(
        repoRoot,
        "supabase/migrations/20261111000001_phase02_checkout_hardening.sql"
      );
      assert.ok(fs.existsSync(migPath), "Phase 02 migration file must exist");
      const sql = fs.readFileSync(migPath, "utf8");

      const protectedRpcs = [
        "create_order_atomic",
        "cancel_order_atomic",
        "record_order_consent_atomic",
        "settle_payment_atomic",
        "record_payment_failure_atomic",
        "record_refund_atomic",
        "release_expired_reservations_atomic",
        "prepare_payment_attempt_atomic",
        "initiate_return_refund_atomic",
      ];

      for (const rpc of protectedRpcs) {
        const revokeRe = new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${rpc}.*FROM PUBLIC, anon, authenticated`, "i");
        const grantRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}.*TO postgres, service_role`, "i");
        assert.ok(revokeRe.test(sql), `Missing REVOKE EXECUTE on ${rpc}`);
        assert.ok(grantRe.test(sql), `Missing service_role GRANT EXECUTE on ${rpc}`);
      }

      // Every function created/replaced in Phase 02 migration must harden SECURITY DEFINER + search_path = public, pg_temp
      const fnDefs = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g) || [];
      assert.ok(fnDefs.length >= 6, "Expected hardened functions in Phase 02 migration");
      for (const fnSql of fnDefs) {
        assert.match(fnSql, /SECURITY DEFINER/i);
        assert.match(fnSql, /SET search_path = public, pg_temp/i);
      }

      // Verify no "use client" module calls create_order_atomic or cancel_order_atomic directly
      const appDir = path.resolve(process.cwd(), "app");
      const componentsDir = path.resolve(process.cwd(), "components");
      const scanFiles = (dir: string): string[] => {
        if (!fs.existsSync(dir)) return [];
        const res: string[] = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) res.push(...scanFiles(full));
          else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) res.push(full);
        }
        return res;
      };
      for (const f of [...scanFiles(appDir), ...scanFiles(componentsDir)]) {
        const content = fs.readFileSync(f, "utf8");
        if (content.includes('"use client"') || content.includes("'use client'")) {
          assert.ok(!content.includes("create_order_atomic"), `Client component references create_order_atomic: ${f}`);
          assert.ok(!content.includes("cancel_order_atomic"), `Client component references cancel_order_atomic: ${f}`);
          assert.ok(!content.includes("settle_payment_atomic"), `Client component references settle_payment_atomic: ${f}`);
        }
      }
    });

    console.log(`\n=== ALL ${passed} PHASE 02 OFFLINE TESTS PASSED ===`);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) Reflect.deleteProperty(process.env, key);
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      Reflect.set(process.env, k, v);
    }
  }
}

runTests().catch((err) => {
  console.error("\n❌ PHASE 02 VERIFICATION SUITE FAILED:", err);
  process.exit(1);
});
