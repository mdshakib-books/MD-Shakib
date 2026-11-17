/**
 * Phase 03 — Admin, Roles & Order Management Hardening Verification Suite
 *
 * Offline comprehensive test suite covering:
 * - Task A: Staff-role permission matrix across TypeScript, API routes, UI, and PostgreSQL RLS/RPCs
 * - Task B: Manual shipment vs Delhivery API booking separation, no fake DLH-* AWBs, no silent Delhivery defaults
 * - Task C: Order list / order detail fulfillment parity & shipment event timeline
 * - Task D: Strict order state transitions, Delhivery/manual courier-aware dispatched cancellation & webhook safety
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  ASSIGNABLE_STAFF_ROLES,
  getPermissionsForRole,
  hasAnyPermission,
  hasPermission,
  isStaffRole,
  type StaffPermission,
  type StaffRole,
} from "../lib/admin/permissions";
import {
  DISPATCHED_ORDER_STATUSES,
  FULFILLMENT_SHIPPING_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  isDelhiveryShipment,
  isSyntheticPlaceholderAwb,
  resolveOrderTrackingUrl,
} from "../lib/admin/constants";
import {
  cancelDelhiveryShipment,
  createShipmentForOrder,
  isAllowedStatusTransition,
  processDelhiveryWebhook,
} from "../lib/integrations/delhivery/service";
import { renderShipmentNotificationHtml } from "../lib/integrations/resend/templates";
import {
  executeDispatchedOrderCancellation,
  executeOrderCancellation,
} from "../lib/commerce/orders-core";

let passed = 0;
let failed = 0;

async function testCase(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err?.stack || err?.message || err}`);
    failed++;
  }
}

const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// ==============================================================================
// IN-MEMORY MOCK SUPABASE ADMIN CLIENT FOR PHASE 03 LIFECYCLE TESTS
// ==============================================================================

class Phase03MockDb {
  orders = new Map<string, any>();
  profiles = new Map<string, any>();
  books = new Map<string, any>();
  inventory_reservations: any[] = [];
  shipments: any[] = [];
  shipment_events: any[] = [];
  delivery_otps: any[] = [];
  refund_records = new Map<string, any>();
  discounts = new Map<string, any>();
  audit_logs: any[] = [];
  private seq = 1;

  nextUuid(): string {
    const hex = (this.seq++).toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  }

  from(table: string) {
    const db = this;
    const state: {
      op: "select" | "update" | "insert";
      payload: any;
      filters: Array<(row: any) => boolean>;
    } = {
      op: "select",
      payload: null,
      filters: [],
    };

    const getTableArray = (): any[] => {
      switch (table) {
        case "orders":
          return Array.from(db.orders.values());
        case "profiles":
          return Array.from(db.profiles.values());
        case "books":
          return Array.from(db.books.values());
        case "inventory_reservations":
          return db.inventory_reservations;
        case "shipments":
          return db.shipments;
        case "shipment_events":
          return db.shipment_events;
        case "delivery_otps":
          return db.delivery_otps;
        case "audit_logs":
          return db.audit_logs;
        default:
          return [];
      }
    };

    const applyUpdate = (): any[] => {
      const rows = getTableArray().filter((r) => state.filters.every((f) => f(r)));
      for (const row of rows) {
        Object.assign(row, state.payload);
      }
      return rows;
    };

    const chain: any = {
      select() {
        return chain;
      },
      insert(payload: any) {
        state.op = "insert";
        state.payload = Array.isArray(payload) ? payload : [payload];
        const inserted: any[] = [];
        for (const item of state.payload) {
          const row = {
            id: item.id || db.nextUuid(),
            created_at: new Date().toISOString(),
            ...item,
          };
          if (table === "orders") db.orders.set(row.id, row);
          else if (table === "shipments") db.shipments.push(row);
          else if (table === "shipment_events") db.shipment_events.push(row);
          else if (table === "audit_logs") db.audit_logs.push(row);
          inserted.push(row);
        }
        const execResult = { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
        return {
          ...chain,
          select: () => ({
            maybeSingle: async () => execResult,
            single: async () => execResult,
            then: (res: any) => res(execResult),
          }),
          then: (res: any) => res(execResult),
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
      is(col: string, val: any) {
        state.filters.push((r) => r[col] === val);
        return chain;
      },
      in(col: string, vals: any[]) {
        state.filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      not(col: string, _op: string, rawVal: string) {
        if (_op === "in" && rawVal.includes("cancelled")) {
          state.filters.push((r) => !["cancelled", "failed"].includes(r[col]));
        }
        return chain;
      },
      async single() {
        if (state.op === "update") {
          const rows = applyUpdate();
          return rows[0]
            ? { data: rows[0], error: null }
            : { data: null, error: { message: "No matching row" } };
        }
        const rows = getTableArray().filter((r) => state.filters.every((f) => f(r)));
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "Not found" } };
      },
      async maybeSingle() {
        if (state.op === "update") {
          const rows = applyUpdate();
          return { data: rows[0] || null, error: null };
        }
        const rows = getTableArray().filter((r) => state.filters.every((f) => f(r)));
        return { data: rows[0] || null, error: null };
      },
      then(resolve: any) {
        if (state.op === "update") {
          const rows = applyUpdate();
          return resolve({ data: rows, error: null });
        }
        const rows = getTableArray().filter((r) => state.filters.every((f) => f(r)));
        return resolve({ data: rows, error: null });
      },
    };

    return chain;
  }

  async rpc(fnName: string, args: Record<string, any>) {
    if (fnName === "cancel_order_atomic") {
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: null, error: { message: "Order not found" } };
      if (args.p_is_admin) {
        const prof = this.profiles.get(args.p_user_id);
        if (!prof || !hasPermission(prof.role, "orders.cancel") || prof.is_blocked || prof.is_deleted) {
          return { data: null, error: { message: "Unauthorized: orders.cancel required" } };
        }
      } else if (order.user_id !== args.p_user_id) {
        return { data: null, error: { message: "Not authorized" } };
      }

      if (["Shipped", "Out for Delivery"].includes(order.order_status)) {
        return {
          data: null,
          error: {
            message: `Order is in "${order.order_status}" status and requires confirmed courier cancellation via cancel_dispatched_order_atomic.`,
          },
        };
      }
      if (["Cancelled", "Delivered", "Returned"].includes(order.order_status)) {
        return { data: null, error: { message: `Cannot cancel in ${order.order_status}` } };
      }

      for (const res of this.inventory_reservations.filter(
        (r) => r.order_id === order.id && (r.status === "reserved" || r.status === "committed")
      )) {
        const b = this.books.get(res.book_id);
        if (b) b.stock += res.quantity;
        res.status = "released";
        res.release_reason = "order_cancelled";
      }

      order.order_status = "Cancelled";
      order.cancel_reason = args.p_cancel_reason;
      if (order.payment_method === "ONLINE" && (order.is_paid || order.payment_status === "Paid")) {
        order.payment_status = "Refund Pending";
        order.refund_status = "pending";
        order.refund_amount = order.total_amount;
      }
      return { data: true, error: null };
    }

    if (fnName === "cancel_dispatched_order_atomic") {
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: null, error: { message: "Order not found" } };
      const prof = this.profiles.get(args.p_admin_id);
      if (!prof || !hasPermission(prof.role, "orders.cancel_dispatched") || prof.is_blocked || prof.is_deleted) {
        return {
          data: null,
          error: { message: "Unauthorized: Super Admin or Admin required for dispatched cancellation" },
        };
      }
      if (args.p_courier_confirmed !== true) {
        return { data: null, error: { message: "Courier cancellation confirmation required" } };
      }
      if (!["Shipped", "Out for Delivery"].includes(order.order_status)) {
        return { data: null, error: { message: "Order must be Shipped or Out for Delivery" } };
      }

      // Inventory NOT restocked automatically on post-dispatch cancellation
      for (const res of this.inventory_reservations.filter(
        (r) => r.order_id === order.id && (r.status === "reserved" || r.status === "committed")
      )) {
        res.status = "released";
        res.release_reason = "cancelled_post_dispatch_no_restock";
      }

      const prevStatus = order.order_status;
      order.order_status = "Cancelled";
      order.cancel_reason = args.p_cancel_reason;
      order.shipping_booking_status = "cancelled";
      order.shipping_cancelled_at = new Date().toISOString();

      if (order.payment_method === "ONLINE" && (order.is_paid || order.payment_status === "Paid")) {
        order.payment_status = "Refund Pending";
        order.refund_status = "pending";
        order.refund_amount = order.total_amount;
      }

      let shipmentId: string | null = null;
      for (const sh of this.shipments) {
        if (sh.order_id === order.id && !["cancelled", "failed"].includes(sh.status)) {
          sh.status = "cancelled";
          sh.cancelled_at = new Date().toISOString();
          sh.cancel_reason = args.p_cancel_reason;
          shipmentId = sh.id;
        }
      }

      this.shipment_events.push({
        id: this.nextUuid(),
        shipment_id: shipmentId,
        order_id: order.id,
        event_type:
          args.p_cancellation_mode === "delhivery_api"
            ? "courier_cancel_confirmed"
            : "manual_cancel_confirmed",
        source:
          args.p_cancellation_mode === "delhivery_api" ? "delhivery_api" : "admin_action",
        previous_status: prevStatus,
        new_status: "Cancelled",
        actor_id: args.p_admin_id,
        actor_role: prof.role,
        carrier_name: order.shipping_courier,
        awb: order.shipping_awb,
        note: args.p_cancel_reason,
        metadata: args.p_provider_response || {},
        created_at: new Date().toISOString(),
      });

      this.audit_logs.push({
        id: this.nextUuid(),
        user_id: args.p_admin_id,
        action: "CANCEL_DISPATCHED_ORDER",
        model_name: "orders",
        model_id: order.id,
        changes: {
          cancellation_mode: args.p_cancellation_mode,
          manual_confirmation_ref: args.p_manual_confirmation_ref,
          inventory_restocked: false,
        },
      });

      return {
        data: { success: true, order_id: order.id, previous_status: prevStatus, shipment_id: shipmentId },
        error: null,
      };
    }

    if (fnName === "create_manual_shipment_atomic") {
      const prof = this.profiles.get(args.p_actor_id);
      if (!prof || !hasPermission(prof.role, "orders.ship") || prof.is_blocked || prof.is_deleted) {
        return { data: null, error: { message: "Unauthorized: orders.ship required" } };
      }
      const order = this.orders.get(args.p_order_id);
      if (!order) return { data: null, error: { message: "Order not found" } };
      const carrier = String(args.p_carrier_name || "").trim();
      const awb = args.p_awb ? String(args.p_awb).trim() : null;
      const trackingUrl = args.p_tracking_url ? String(args.p_tracking_url).trim() : null;

      if (!carrier) return { data: null, error: { message: "Carrier name required" } };
      if (isSyntheticPlaceholderAwb(awb)) {
        return { data: null, error: { message: "Synthetic DLH-* AWBs are not allowed" } };
      }
      if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
        return { data: null, error: { message: "Invalid tracking URL" } };
      }
      if (carrier.toLowerCase() === "delhivery" && !awb) {
        return { data: null, error: { message: "Manual Delhivery requires an existing AWB" } };
      }

      const prevStatus = order.order_status;
      const nextStatus = args.p_mark_as_shipped !== false ? "Shipped" : prevStatus;
      order.shipping_booking_mode = "manual";
      order.shipping_booking_status = "manual_entered";
      order.shipping_courier = carrier;
      order.shipping_awb = awb;
      order.shipping_tracking_url = trackingUrl;
      order.order_status = nextStatus;

      const shipmentId = this.nextUuid();
      this.shipments.push({
        id: shipmentId,
        order_id: order.id,
        booking_mode: "manual",
        status: nextStatus === "Shipped" ? "dispatched" : "booked",
        carrier_name: carrier,
        awb,
        tracking_url: trackingUrl,
      });
      this.shipment_events.push({
        id: this.nextUuid(),
        shipment_id: shipmentId,
        order_id: order.id,
        event_type: "manual_shipment_created",
        source: "warehouse_action",
        previous_status: prevStatus,
        new_status: nextStatus,
        actor_id: args.p_actor_id,
        actor_role: prof.role,
        carrier_name: carrier,
        awb,
      });

      return {
        data: {
          success: true,
          shipment_id: shipmentId,
          carrier_name: carrier,
          awb,
          tracking_url: trackingUrl,
          order_status: nextStatus,
        },
        error: null,
      };
    }

    return { data: null, error: { message: `Unhandled RPC: ${fnName}` } };
  }
}

async function runTests() {
  console.log("\n=== PHASE 03 VERIFICATION: ADMIN, ROLES & ORDER MANAGEMENT ===\n");

  // --------------------------------------------------------------------------
  // TASK A: STAFF ROLES & PERMISSION BOUNDARIES
  // --------------------------------------------------------------------------
  await testCase("A1: Staff permission matrix enforces least privilege across all 6 roles", () => {
    assert.deepStrictEqual(ASSIGNABLE_STAFF_ROLES, [
      "user",
      "support_staff",
      "warehouse_staff",
      "order_manager",
      "admin",
      "super_admin",
    ]);

    // Super Admin
    assert.strictEqual(isStaffRole("super_admin"), true);
    assert.strictEqual(hasPermission("super_admin", "users.manage_roles"), true);
    assert.strictEqual(hasPermission("super_admin", "orders.cancel_dispatched"), true);
    assert.strictEqual(hasPermission("super_admin", "orders.refund"), true);
    assert.strictEqual(hasPermission("super_admin", "orders.settle_cod"), true);

    // Admin
    assert.strictEqual(isStaffRole("admin"), true);
    assert.strictEqual(hasPermission("admin", "orders.cancel"), true);
    assert.strictEqual(hasPermission("admin", "orders.cancel_dispatched"), true);
    assert.strictEqual(hasPermission("admin", "orders.refund"), true);
    assert.strictEqual(hasPermission("admin", "orders.settle_cod"), true);
    assert.strictEqual(hasPermission("admin", "orders.ship"), true);
    assert.strictEqual(hasPermission("admin", "users.manage"), true);
    assert.strictEqual(hasPermission("admin", "users.manage_roles"), false);

    // Order Manager
    assert.strictEqual(hasPermission("order_manager", "orders.view"), true);
    assert.strictEqual(hasPermission("order_manager", "orders.manage"), true);
    assert.strictEqual(hasPermission("order_manager", "orders.cancel"), true);
    assert.strictEqual(hasPermission("order_manager", "orders.export"), true);
    assert.strictEqual(hasPermission("order_manager", "orders.ship"), false);
    assert.strictEqual(hasPermission("order_manager", "orders.cancel_dispatched"), false);
    assert.strictEqual(hasPermission("order_manager", "orders.refund"), false);
    assert.strictEqual(hasPermission("order_manager", "orders.settle_cod"), false);
    assert.strictEqual(hasPermission("order_manager", "users.manage_roles"), false);

    // Warehouse Staff
    assert.strictEqual(hasPermission("warehouse_staff", "orders.view"), true);
    assert.strictEqual(hasPermission("warehouse_staff", "orders.manage"), true);
    assert.strictEqual(hasPermission("warehouse_staff", "orders.ship"), true);
    assert.strictEqual(hasPermission("warehouse_staff", "delivery.verify"), true);
    assert.strictEqual(hasPermission("warehouse_staff", "inventory.manage"), true);
    assert.strictEqual(hasPermission("warehouse_staff", "orders.cancel"), false);
    assert.strictEqual(hasPermission("warehouse_staff", "orders.cancel_dispatched"), false);
    assert.strictEqual(hasPermission("warehouse_staff", "orders.refund"), false);
    assert.strictEqual(hasPermission("warehouse_staff", "orders.settle_cod"), false);

    // Support Staff (view orders & support/reviews ONLY — never mutate orders/shipments/refunds/COD)
    assert.strictEqual(hasPermission("support_staff", "orders.view"), true);
    assert.strictEqual(hasPermission("support_staff", "support.manage"), true);
    assert.strictEqual(hasPermission("support_staff", "reviews.manage"), true);
    assert.strictEqual(hasPermission("support_staff", "orders.manage"), false);
    assert.strictEqual(hasPermission("support_staff", "orders.ship"), false);
    assert.strictEqual(hasPermission("support_staff", "orders.cancel"), false);
    assert.strictEqual(hasPermission("support_staff", "orders.cancel_dispatched"), false);
    assert.strictEqual(hasPermission("support_staff", "orders.refund"), false);
    assert.strictEqual(hasPermission("support_staff", "orders.settle_cod"), false);
    assert.strictEqual(hasPermission("support_staff", "returns.manage"), false);

    // Customer ('user') & unknown roles
    assert.strictEqual(isStaffRole("user"), false);
    assert.strictEqual(getPermissionsForRole("user").length, 0);
    assert.strictEqual(hasAnyPermission("operations" as StaffRole, ["orders.manage"]), false);
  });

  await testCase("A2: Admin API routes & server actions eliminate hardcoded 'operations' and bare requireAdmin() on order ops", () => {
    const adminApiFiles = [
      "apps/web/app/api/admin/books/export/route.ts",
      "apps/web/app/api/admin/books/import/route.ts",
      "apps/web/app/api/admin/books/[id]/variants/route.ts",
      "apps/web/app/api/admin/support/tickets/[id]/route.ts",
      "apps/web/app/api/admin/delivery/cod-collect/route.ts",
      "apps/web/app/api/admin/delivery/verify-otp/route.ts",
      "apps/web/app/api/admin/returns/pickup/route.ts",
      "apps/web/app/api/admin/returns/review/route.ts",
      "apps/web/app/api/admin/returns/refund/route.ts",
      "apps/web/app/api/admin/orders/[id]/status/route.ts",
      "apps/web/app/api/admin/orders/export/route.ts",
      "apps/web/app/api/admin/customers/export/route.ts",
      "apps/web/app/api/admin/media/sign/route.ts",
      "apps/web/app/api/admin/media/upload/route.ts",
    ];

    for (const rel of adminApiFiles) {
      const content = readRepoFile(rel);
      assert.ok(!content.includes('"operations"'), `${rel} must not reference non-existent role "operations"`);
      assert.ok(content.includes("verifyAdminApi("), `${rel} must use verifyAdminApi(...)`);
    }

    // cod-collect and returns/refund must NEVER allow orders.manage fallback
    assert.ok(!readRepoFile("apps/web/app/api/admin/delivery/cod-collect/route.ts").includes("orders.manage"));
    assert.ok(!readRepoFile("apps/web/app/api/admin/returns/refund/route.ts").includes("orders.manage"));
    assert.ok(readRepoFile("apps/web/app/api/admin/returns/refund/route.ts").includes("orders.refund"));
    assert.ok(readRepoFile("apps/web/app/api/admin/delivery/cod-collect/route.ts").includes("orders.settle_cod"));

    // Page permission alignment
    assert.ok(readRepoFile("apps/web/app/admin/support/page.tsx").includes('"support.manage"'));
    assert.ok(readRepoFile("apps/web/app/admin/returns/page.tsx").includes('"returns.manage"'));
    assert.ok(readRepoFile("apps/web/app/admin/delivery-verification/page.tsx").includes('"delivery.verify"'));

    // Admin orders server actions must not rely on bare requireAdmin()
    const adminOrdersTs = readRepoFile("apps/web/lib/admin/orders.ts");
    assert.ok(!adminOrdersTs.includes("requireAdmin("), "lib/admin/orders.ts must not call bare requireAdmin()");
    assert.ok(adminOrdersTs.includes('verifyStaffActionPermission("orders.ship")'));
    assert.ok(adminOrdersTs.includes('verifyStaffActionPermission("orders.refund")'));
    assert.ok(adminOrdersTs.includes('verifyStaffActionPermission("orders.settle_cod")'));
    assert.ok(adminOrdersTs.includes('"orders.cancel_dispatched"'));

    // Navigation & Layout filter links by userRole permissions
    assert.ok(readRepoFile("apps/web/app/admin/layout.tsx").includes("userRole={profile.role}"));
    assert.ok(readRepoFile("apps/web/app/admin/AdminNavClient.tsx").includes("hasPermission(userRole"));
  });

  await testCase("A3: Phase 03 SQL migration aligns PostgreSQL RLS & SECURITY DEFINER RPCs with multi-role matrix", () => {
    const sql = readRepoFile("supabase/migrations/20261112000001_phase03_admin_roles_order_management.sql");
    const requiredTokens: Array<[string, string]> = [
      ["role_has_staff_permission", "role->permission SQL mapper"],
      ["user_has_staff_permission", "user_has_staff_permission helper"],
      ["can_manage_orders()", "orders RLS update helper"],
      ["can_ship_orders()", "shipments RLS helper"],
      ["can_manage_support()", "support tickets RLS helper"],
      ["can_manage_returns()", "returns RLS helper"],
      ["orders_select_policy", "orders SELECT policy uses is_staff()"],
      ["orders_update_policy", "orders UPDATE policy uses can_manage_orders()"],
      ["refund_records_admin_write", "refund_records write policy strictly is_admin()"],
      ["cod_collections_admin_write", "cod_collections write policy strictly is_admin()"],
      ["adjust_inventory_atomic", "inventory RPC allows warehouse_staff"],
      ["moderate_review_atomic", "review RPC allows support_staff"],
      ["update_customer_status", "customer status RPC allows super_admin/admin"],
    ];

    for (const [token, desc] of requiredTokens) {
      assert.ok(sql.includes(token), `SQL migration missing ${desc} (${token})`);
    }
  });

  // --------------------------------------------------------------------------
  // TASK B: NO FAKE AWBs, NO HARDCODED DELHIVERY DEFAULTS, MODE 1 vs MODE 2
  // --------------------------------------------------------------------------
  await testCase("B1: No synthetic DLH-* AWB generation or silent Delhivery courier defaults in admin/customer/email code", () => {
    assert.ok(isSyntheticPlaceholderAwb("DLH-1234ABCD"));
    assert.ok(isSyntheticPlaceholderAwb("dlh-abcdef12"));
    assert.strictEqual(isSyntheticPlaceholderAwb("1234567890123"), false);

    const filesNoFakeAwb = [
      "apps/web/app/admin/orders/AdminOrdersClient.tsx",
      "apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx",
      "apps/web/components/admin/AdminShipmentModal.tsx",
    ];
    for (const rel of filesNoFakeAwb) {
      const content = readRepoFile(rel);
      assert.ok(!content.includes("DLH-${"), `${rel} must never fabricate DLH-* placeholder AWBs`);
    }

    const filesNoDelhiveryDefault = [
      "apps/web/app/admin/orders/AdminOrdersClient.tsx",
      "apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx",
      "apps/web/lib/admin/orders.ts",
      "apps/web/lib/admin/reports.ts",
      "apps/web/lib/commerce/invoices.ts",
      "apps/web/lib/integrations/resend/service.ts",
      "apps/web/lib/integrations/resend/templates.ts",
      "apps/web/app/orders/[id]/OrderDetailClient.tsx",
    ];
    for (const rel of filesNoDelhiveryDefault) {
      const content = readRepoFile(rel);
      assert.ok(
        !content.includes('|| "Delhivery"') && !content.includes('|| "Delhivery Express"'),
        `${rel} must never silently default courier to "Delhivery"`
      );
    }

    const sql = readRepoFile("supabase/migrations/20261112000001_phase03_admin_roles_order_management.sql");
    assert.ok(sql.includes("ALTER COLUMN shipping_courier SET DEFAULT NULL"));
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.shipments"));
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.shipment_events"));
  });

  await testCase("B2: Tracking URL resolution & shipment email never emit fake Delhivery links for manual carriers", () => {
    assert.strictEqual(
      resolveOrderTrackingUrl({ courier: "India Post", awb: "IN99887766", bookingMode: "manual" }),
      null
    );
    assert.strictEqual(
      resolveOrderTrackingUrl({
        courier: "Blue Dart",
        awb: "BD112233",
        trackingUrl: "https://bluedart.example/track/BD112233",
        bookingMode: "manual",
      }),
      "https://bluedart.example/track/BD112233"
    );
    assert.strictEqual(
      resolveOrderTrackingUrl({ courier: "Delhivery", awb: "DLV98765", bookingMode: "delhivery" }),
      "https://track.delhivery.com/p/DLV98765"
    );
    assert.strictEqual(
      isDelhiveryShipment({
        courier: "Delhivery",
        bookingMode: "manual",
        trackingUrl: "https://track.delhivery.com/p/X",
      }),
      false
    );

    const htmlManualNoUrl = renderShipmentNotificationHtml(
      {
        id: "ord-1",
        order_number: "MDS-2001",
        total_amount: 550,
        payment_method: "ONLINE",
        created_at: new Date().toISOString(),
        address_snapshot: {
          full_name: "Amina",
          house_no: "12",
          area: "Okhla",
          city: "New Delhi",
          state: "Delhi",
          pincode: "110025",
          phone: "9876543210",
        },
      },
      "Amina",
      "shipped",
      undefined,
      "Local Courier"
    );
    assert.ok(htmlManualNoUrl.includes("Local Courier"));
    assert.ok(!htmlManualNoUrl.includes("track.delhivery.com"));
    assert.ok(htmlManualNoUrl.includes("Not provided by carrier"));
  });

  await testCase("B3: Mode 1 Delhivery booking handles timeouts as booking_uncertain, rejects conflicts & prevents double-booking", async () => {
    const db = new Phase03MockDb();
    const orderId = db.nextUuid();
    db.orders.set(orderId, {
      id: orderId,
      user_id: db.nextUuid(),
      order_status: "Packed",
      payment_status: "Paid",
      payment_method: "ONLINE",
      shipping_courier: null,
      shipping_awb: null,
      shipping_tracking_url: null,
      shipping_booking_mode: null,
      shipping_booking_status: "unbooked",
      total_amount: 450,
      address_snapshot: {
        full_name: "Zaid",
        house_no: "1",
        area: "Jamia",
        city: "Delhi",
        state: "Delhi",
        pincode: "110025",
        phone: "9999999999",
      },
    });

    const prevEnv = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      ENABLE_DELHIVERY: process.env.ENABLE_DELHIVERY,
      DELHIVERY_MODE: process.env.DELHIVERY_MODE,
      DELHIVERY_TOKEN: process.env.DELHIVERY_TOKEN,
      DELHIVERY_WEBHOOK_SECRET: process.env.DELHIVERY_WEBHOOK_SECRET,
    };

    try {
      process.env.APP_ENV = "staging";
      process.env.ENABLE_DELHIVERY = "true";
      process.env.DELHIVERY_MODE = "sandbox";
      process.env.DELHIVERY_TOKEN = "sandbox-real-token-xyz-9988";
      process.env.DELHIVERY_WEBHOOK_SECRET = "sandbox-webhook-secret-xyz-9988";

      // 1) Simulate timeout -> booking_uncertain & order stays Packed (not Shipped!)
      await assert.rejects(
        () =>
          createShipmentForOrder(orderId, {
            adminDb: db,
            timeoutMs: 20,
            fetchFn: (_url: any, init: any) =>
              new Promise((_res, rej) => {
                init?.signal?.addEventListener("abort", () => {
                  const err = new Error("Aborted");
                  err.name = "AbortError";
                  rej(err);
                });
              }),
          }),
        /timed out/i
      );

      assert.strictEqual(db.orders.get(orderId).shipping_booking_status, "booking_uncertain");
      assert.strictEqual(db.orders.get(orderId).order_status, "Packed");
      assert.ok(db.shipment_events.some((e) => e.event_type === "booking_uncertain"));

      // Subsequent blind retry on uncertain booking is blocked to avoid duplicate parcels
      await assert.rejects(
        () => createShipmentForOrder(orderId, { adminDb: db }),
        /uncertain state/i
      );

      // 2) Manual order cannot be overwritten by Delhivery API
      const manualOrderId = db.nextUuid();
      db.orders.set(manualOrderId, {
        id: manualOrderId,
        user_id: db.nextUuid(),
        order_status: "Packed",
        payment_status: "Paid",
        payment_method: "ONLINE",
        shipping_courier: "India Post",
        shipping_booking_mode: "manual",
        shipping_booking_status: "manual_entered",
      });
      await assert.rejects(
        () => createShipmentForOrder(manualOrderId, { adminDb: db }),
        /manual shipment/i
      );

      // 3) Clear uncertain state -> failed HTTP 500 sets booking_failed without Shipped, then success books AWB
      db.orders.get(orderId).shipping_booking_status = "unbooked";
      await assert.rejects(
        () =>
          createShipmentForOrder(orderId, {
            adminDb: db,
            fetchFn: async () => new Response("error", { status: 500 }),
          }),
        /HTTP 500/
      );
      assert.strictEqual(db.orders.get(orderId).shipping_booking_status, "booking_failed");
      assert.strictEqual(db.orders.get(orderId).order_status, "Packed");

      const booked = await createShipmentForOrder(orderId, {
        adminDb: db,
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              success: true,
              packages: [{ waybill: "DLVTEST987654", status: "Success" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
      });

      assert.strictEqual(booked.awb, "DLVTEST987654");
      assert.strictEqual(booked.courier, "Delhivery");
      assert.strictEqual(db.orders.get(orderId).order_status, "Shipped");
      assert.strictEqual(db.orders.get(orderId).shipping_booking_mode, "delhivery");
      assert.strictEqual(db.orders.get(orderId).shipping_booking_status, "booked");
      assert.ok(db.shipment_events.some((e) => e.event_type === "delhivery_booked"));
    } finally {
      restoreEnv(prevEnv);
    }
  });

  await testCase("B4: Mode 2 Manual shipment entry supports non-Delhivery carriers with optional AWB & preserves role checks", async () => {
    const db = new Phase03MockDb();
    const warehouseId = db.nextUuid();
    const supportId = db.nextUuid();
    const orderId = db.nextUuid();

    db.profiles.set(warehouseId, {
      id: warehouseId,
      role: "warehouse_staff",
      is_blocked: false,
      is_deleted: false,
    });
    db.profiles.set(supportId, {
      id: supportId,
      role: "support_staff",
      is_blocked: false,
      is_deleted: false,
    });
    db.orders.set(orderId, {
      id: orderId,
      order_status: "Packed",
      payment_status: "Paid",
      payment_method: "ONLINE",
      shipping_courier: null,
      shipping_awb: null,
    });

    // support_staff denied
    const denied = await db.rpc("create_manual_shipment_atomic", {
      p_order_id: orderId,
      p_actor_id: supportId,
      p_carrier_name: "Local Courier",
      p_awb: null,
      p_tracking_url: null,
      p_mark_as_shipped: true,
    });
    assert.ok(denied.error?.message.includes("orders.ship"));

    // synthetic DLH-* AWB rejected
    const fakeAwb = await db.rpc("create_manual_shipment_atomic", {
      p_order_id: orderId,
      p_actor_id: warehouseId,
      p_carrier_name: "India Post",
      p_awb: "DLH-ABCD1234",
      p_tracking_url: null,
      p_mark_as_shipped: true,
    });
    assert.ok(fakeAwb.error?.message.includes("Synthetic DLH-*"));

    // Valid local courier with NO AWB and NO tracking URL succeeds cleanly
    const ok = await db.rpc("create_manual_shipment_atomic", {
      p_order_id: orderId,
      p_actor_id: warehouseId,
      p_carrier_name: "Local Hand Delivery",
      p_awb: null,
      p_tracking_url: null,
      p_mark_as_shipped: true,
    });
    assert.strictEqual(ok.error, null);
    assert.strictEqual(db.orders.get(orderId).shipping_courier, "Local Hand Delivery");
    assert.strictEqual(db.orders.get(orderId).shipping_awb, null);
    assert.strictEqual(db.orders.get(orderId).shipping_tracking_url, null);
    assert.strictEqual(db.orders.get(orderId).shipping_booking_mode, "manual");
    assert.strictEqual(db.orders.get(orderId).order_status, "Shipped");
  });

  // --------------------------------------------------------------------------
  // TASK C: ORDER DETAIL & LIST PARITY
  // --------------------------------------------------------------------------
  await testCase("C1: Order Detail and Orders List share unified Shipment/Cancel modals & enforce non-Delhivery guards", () => {
    const listClient = readRepoFile("apps/web/app/admin/orders/AdminOrdersClient.tsx");
    const detailClient = readRepoFile("apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx");

    assert.ok(listClient.includes("AdminShipmentModal"));
    assert.ok(detailClient.includes("AdminShipmentModal"));
    assert.ok(listClient.includes("AdminCancelOrderModal"));
    assert.ok(detailClient.includes("AdminCancelOrderModal"));

    // Order detail displays booking mode/status, tracking unavailable, and shipment event log
    assert.ok(detailClient.includes("Tracking unavailable"));
    assert.ok(detailClient.includes("Not assigned"));
    assert.ok(detailClient.includes("canUseDelhiveryOps"));
    assert.ok(detailClient.includes("order.shipmentEvents"));
  });

  // --------------------------------------------------------------------------
  // TASK D: TRANSITION RESTRICTIONS, COURIER CANCELLATION & WEBHOOK SAFETY
  // --------------------------------------------------------------------------
  await testCase("D1: ORDER_STATUS_TRANSITIONS & SQL migration forbid direct Shipped/Out-for-Delivery cancellation", () => {
    assert.strictEqual(ORDER_STATUS_TRANSITIONS["Shipped"]?.includes("Cancelled"), false);
    assert.strictEqual(ORDER_STATUS_TRANSITIONS["Out for Delivery"]?.includes("Cancelled"), false);
    assert.strictEqual(ORDER_STATUS_TRANSITIONS["Delivered"]?.includes("Cancelled"), false);
    assert.strictEqual(ORDER_STATUS_TRANSITIONS["Cancelled"]?.length, 0);
    assert.strictEqual(ORDER_STATUS_TRANSITIONS["Returned"]?.length, 0);
    assert.ok(DISPATCHED_ORDER_STATUSES.has("Shipped"));
    assert.ok(DISPATCHED_ORDER_STATUSES.has("Out for Delivery"));
    assert.ok(FULFILLMENT_SHIPPING_STATUSES.has("Shipped"));

    const sql = readRepoFile("supabase/migrations/20261112000001_phase03_admin_roles_order_management.sql");
    assert.ok(sql.includes('Direct transition from "Shipped" to "Cancelled" is prohibited'));
    assert.ok(sql.includes('Direct transition from "Out for Delivery" to "Cancelled" is prohibited'));
    assert.ok(sql.includes("cancel_dispatched_order_atomic"));
    assert.ok(sql.includes("app.allow_verified_courier_cancellation"));
  });

  await testCase("D2: executeOrderCancellation rejects Shipped & Out for Delivery orders; dispatched Delhivery cancel fails safely if API rejects", async () => {
    const db = new Phase03MockDb();
    const adminId = db.nextUuid();
    const orderManagerId = db.nextUuid();
    const userId = db.nextUuid();
    const bookId = db.nextUuid();
    const orderId = db.nextUuid();

    db.profiles.set(adminId, { id: adminId, role: "admin", is_blocked: false, is_deleted: false });
    db.profiles.set(orderManagerId, {
      id: orderManagerId,
      role: "order_manager",
      is_blocked: false,
      is_deleted: false,
    });
    db.books.set(bookId, { id: bookId, stock: 5 });
    db.orders.set(orderId, {
      id: orderId,
      user_id: userId,
      order_status: "Shipped",
      payment_status: "Paid",
      payment_method: "ONLINE",
      is_paid: true,
      total_amount: 600,
      shipping_courier: "Delhivery",
      shipping_booking_mode: "delhivery",
      shipping_awb: "DLVCANCEL001",
    });
    db.inventory_reservations.push({
      id: db.nextUuid(),
      order_id: orderId,
      book_id: bookId,
      quantity: 2,
      status: "committed",
    });
    db.shipments.push({
      id: db.nextUuid(),
      order_id: orderId,
      booking_mode: "delhivery",
      status: "dispatched",
      carrier_name: "Delhivery",
      awb: "DLVCANCEL001",
    });

    // Direct executeOrderCancellation refuses Shipped order (for both customer & admin)
    const directRes = await executeOrderCancellation(
      { orderId, actorUserId: adminId, reason: "Direct attempt", isAdmin: true },
      { adminDb: db }
    );
    assert.strictEqual(directRes.success, false);
    assert.strictEqual(directRes.orderCancelled, false);
    assert.strictEqual(db.orders.get(orderId).order_status, "Shipped");

    // Failed Delhivery cancel API leaves order Shipped & logs failure
    let refundCalled = 0;
    const failedCourierRes = await executeDispatchedOrderCancellation(
      { orderId, adminUserId: adminId, reason: "Customer requested" },
      {
        adminDb: db,
        cancelDelhiveryShipmentFn: async () => ({
          success: false,
          awb: "DLVCANCEL001",
          error: "Parcel already at destination hub",
        }),
        initiateRefundFn: async () => {
          refundCalled++;
          return { success: true, lifecycleState: "PROCESSED", status: "processed" };
        },
        sendOrderEmailsFn: async () => ({ success: true }),
      }
    );
    assert.strictEqual(failedCourierRes.success, false);
    assert.strictEqual(failedCourierRes.courierCancelFailed, true);
    assert.strictEqual(db.orders.get(orderId).order_status, "Shipped");
    assert.strictEqual(refundCalled, 0);
    assert.ok(db.shipment_events.some((e) => e.event_type === "courier_cancel_failed"));

    // order_manager cannot override dispatched order cancellation
    const omDenied = await db.rpc("cancel_dispatched_order_atomic", {
      p_order_id: orderId,
      p_admin_id: orderManagerId,
      p_cancel_reason: "Attempt",
      p_cancellation_mode: "delhivery_api",
      p_courier_confirmed: true,
    });
    assert.ok(omDenied.error?.message.includes("Unauthorized"));

    // Confirmed Delhivery cancel succeeds, cancels shipment, does NOT restock shelf inventory blindly, & triggers Razorpay refund
    const confirmedCourierRes = await executeDispatchedOrderCancellation(
      { orderId, adminUserId: adminId, reason: "Courier confirmed halt" },
      {
        adminDb: db,
        cancelDelhiveryShipmentFn: async () => ({
          success: true,
          awb: "DLVCANCEL001",
          providerResponse: { status: true },
        }),
        initiateRefundFn: async () => {
          refundCalled++;
          return {
            success: true,
            lifecycleState: "PROCESSED",
            status: "processed",
            refundId: "rfnd_dispatched_123",
          };
        },
        sendOrderEmailsFn: async () => ({ success: true }),
      }
    );
    assert.strictEqual(confirmedCourierRes.success, true);
    assert.strictEqual(confirmedCourierRes.orderCancelled, true);
    assert.strictEqual(confirmedCourierRes.courierCancelled, true);
    assert.strictEqual(confirmedCourierRes.refundId, "rfnd_dispatched_123");
    assert.strictEqual(db.orders.get(orderId).order_status, "Cancelled");
    assert.strictEqual(db.shipments[0].status, "cancelled");
    assert.strictEqual(db.books.get(bookId).stock, 5, "Stock must NOT be auto-restocked post-dispatch");
    assert.strictEqual(refundCalled, 1);
    assert.ok(db.shipment_events.some((e) => e.event_type === "courier_cancel_confirmed"));
  });

  await testCase("D3: Manual dispatched order cancellation requires explicit confirmation & reference", async () => {
    const db = new Phase03MockDb();
    const adminId = db.nextUuid();
    const orderId = db.nextUuid();
    db.profiles.set(adminId, { id: adminId, role: "super_admin", is_blocked: false, is_deleted: false });
    db.orders.set(orderId, {
      id: orderId,
      user_id: db.nextUuid(),
      order_status: "Out for Delivery",
      payment_status: "Pending",
      payment_method: "COD",
      is_paid: false,
      total_amount: 399,
      shipping_courier: "Blue Dart",
      shipping_booking_mode: "manual",
      shipping_awb: "BD99123",
    });

    const unconfirmed = await executeDispatchedOrderCancellation(
      { orderId, adminUserId: adminId, reason: "Recipient unavailable" },
      {
        adminDb: db,
        sendOrderEmailsFn: async () => ({ success: true }),
      }
    );
    assert.strictEqual(unconfirmed.success, false);
    assert.strictEqual(db.orders.get(orderId).order_status, "Out for Delivery");

    const confirmed = await executeDispatchedOrderCancellation(
      {
        orderId,
        adminUserId: adminId,
        reason: "Recipient unavailable",
        confirmManualCourierCancellation: true,
        manualConfirmationRef: "BLUEDART-HUB-CALL-882",
      },
      {
        adminDb: db,
        sendOrderEmailsFn: async () => ({ success: true }),
      }
    );
    assert.strictEqual(confirmed.success, true);
    assert.strictEqual(confirmed.orderCancelled, true);
    assert.strictEqual(db.orders.get(orderId).order_status, "Cancelled");
    assert.ok(db.shipment_events.some((e) => e.event_type === "manual_cancel_confirmed"));
  });

  await testCase("D4: cancelDelhiveryShipment & processDelhiveryWebhook enforce fail-closed and non-regression invariants", async () => {
    const prevEnv = {
      APP_ENV: process.env.APP_ENV,
      NODE_ENV: process.env.NODE_ENV,
      ENABLE_DELHIVERY: process.env.ENABLE_DELHIVERY,
      DELHIVERY_MODE: process.env.DELHIVERY_MODE,
      DELHIVERY_TOKEN: process.env.DELHIVERY_TOKEN,
      DELHIVERY_WEBHOOK_SECRET: process.env.DELHIVERY_WEBHOOK_SECRET,
    };

    try {
      process.env.APP_ENV = "staging";
      process.env.ENABLE_DELHIVERY = "true";
      process.env.DELHIVERY_MODE = "sandbox";
      process.env.DELHIVERY_TOKEN = "sandbox-token-xyz-1122";
      process.env.DELHIVERY_WEBHOOK_SECRET = "sandbox-webhook-secret-xyz-1122";

      const rejected = await cancelDelhiveryShipment("DLV111", {
        fetchFn: async () =>
          new Response(JSON.stringify({ status: false, error: "Cannot cancel delivered parcel" }), {
            status: 200,
          }),
      });
      assert.strictEqual(rejected.success, false);

      const confirmed = await cancelDelhiveryShipment("DLV111", {
        fetchFn: async () => new Response(JSON.stringify({ status: true }), { status: 200 }),
      });
      assert.strictEqual(confirmed.success, true);

      // Transition helper blocks regressions
      assert.strictEqual(isAllowedStatusTransition("Delivered", "Shipped"), false);
      assert.strictEqual(isAllowedStatusTransition("Cancelled", "Delivered"), false);
      assert.strictEqual(isAllowedStatusTransition("Pending", "Delivered"), false);
      assert.strictEqual(isAllowedStatusTransition("Shipped", "Out for Delivery"), true);

      // Webhook ignores manual-carrier orders & blocks cancelled order updates
      const db = new Phase03MockDb();
      const manualId = db.nextUuid();
      db.orders.set(manualId, {
        id: manualId,
        order_status: "Shipped",
        shipping_awb: "IND999",
        shipping_courier: "India Post",
        shipping_booking_mode: "manual",
      });
      const manualHook = await processDelhiveryWebhook(
        { waybill: "IND999", status: "DL" },
        { adminDb: db }
      );
      assert.strictEqual(manualHook.status, "ignored_non_delhivery_order");

      const cancelledId = db.nextUuid();
      db.orders.set(cancelledId, {
        id: cancelledId,
        order_status: "Cancelled",
        shipping_awb: "DLV999",
        shipping_courier: "Delhivery",
        shipping_booking_mode: "delhivery",
      });
      const cancelHook = await processDelhiveryWebhook(
        { waybill: "DLV999", status: "DL" },
        { adminDb: db }
      );
      assert.strictEqual(cancelHook.status, "rejected_illegal_transition");
    } finally {
      restoreEnv(prevEnv);
    }
  });

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Unhandled Phase 03 test suite failure:", err);
  process.exit(1);
});
