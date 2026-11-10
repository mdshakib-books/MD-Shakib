"use client";

import * as React from "react";
import { formatPrice } from "@/lib/utils";
import type { SalesReportData, PaymentReportData, InventoryValuationData } from "@/lib/admin/reports";

interface AdminReportsClientProps {
  initialSales: SalesReportData;
  initialPayment: PaymentReportData;
  initialInventory: InventoryValuationData;
  adminRole: string;
}

export function AdminReportsClient({
  initialSales,
  initialPayment,
  initialInventory,
  adminRole,
}: AdminReportsClientProps) {
  const [sales] = React.useState<SalesReportData>(initialSales);
  const [payment] = React.useState<PaymentReportData>(initialPayment);
  const [inventory] = React.useState<InventoryValuationData>(initialInventory);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="border-b border-[#2A2A2A] pb-4">
        <h2 className="text-xl font-serif font-bold text-white uppercase tracking-wider">Business Summaries</h2>
        <p className="text-xs text-neutral-400 mt-1">
          Aggregated sales, payment collection, and inventory valuations from database ledger.
        </p>
      </div>

      {/* 1. SALES REPORT METRICS (2.36) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
          <h2 className="text-base font-serif text-[#C9A24A] font-semibold">
            Sales &amp; Revenue Overview (Last 30 Days)
          </h2>
          <span className="text-xs text-neutral-500 font-mono">SQL RPC: get_sales_report</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">Gross Sales</span>
            <div className="text-2xl font-serif font-bold text-white">{formatPrice(sales.grossSales)}</div>
            <p className="text-[10px] text-neutral-500 mt-1">Total customer invoices</p>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">Net Revenue</span>
            <div className="text-2xl font-serif font-bold text-[#C9A24A]">{formatPrice(sales.netSales)}</div>
            <p className="text-[10px] text-neutral-500 mt-1">Excluding delivery charges</p>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">Total Orders</span>
            <div className="text-2xl font-serif font-bold text-white">{sales.totalOrders}</div>
            <p className="text-[10px] text-emerald-400 mt-1">{sales.deliveredOrders} delivered</p>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-400 block mb-1">Avg Order Value</span>
            <div className="text-2xl font-serif font-bold text-white">{formatPrice(sales.averageOrderValue)}</div>
            <p className="text-[10px] text-neutral-500 mt-1">Across all completed orders</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
            <span className="text-neutral-400">Total Discounts Granted</span>
            <span className="font-semibold text-white">{formatPrice(sales.totalDiscount)}</span>
          </div>
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
            <span className="text-neutral-400">Total Shipping Collected</span>
            <span className="font-semibold text-white">{formatPrice(sales.totalShipping)}</span>
          </div>
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
            <span className="text-neutral-400">Orders Cancelled / Refunded</span>
            <span className="font-semibold text-red-400">{sales.cancelledOrders} / {sales.refundedOrders}</span>
          </div>
        </div>
      </section>

      {/* 2. PAYMENT METHODS & COD RECONCILIATION REPORT (2.37) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
          <h2 className="text-base font-serif text-[#C9A24A] font-semibold">
            Payment Method &amp; Courier Remittance Report
          </h2>
          <span className="text-xs text-neutral-500 font-mono">SQL RPC: get_payment_report</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Prepaid Online */}
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span>Prepaid Online (Razorpay)</span>
              </h3>
              <span className="text-xs text-neutral-400 font-mono">{payment.prepaidCount} orders</span>
            </div>

            <div className="text-3xl font-serif font-bold text-white">
              {formatPrice(payment.prepaidAmount)}
            </div>

            <div className="pt-3 border-t border-[#222222] flex items-center justify-between text-xs text-neutral-400">
              <span>Refunds Processed</span>
              <span className="text-red-400 font-medium">-{formatPrice(payment.refundedAmount)}</span>
            </div>
          </div>

          {/* Cash on Delivery */}
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C9A24A]"></span>
                <span>Cash on Delivery (Delhivery Remittance)</span>
              </h3>
              <span className="text-xs text-neutral-400 font-mono">{payment.codCount} orders</span>
            </div>

            <div className="text-3xl font-serif font-bold text-white">
              {formatPrice(payment.codAmount)}
            </div>

            <div className="pt-3 border-t border-[#222222] grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-500 block">Reconciled Remittance</span>
                <span className="text-emerald-400 font-semibold">{formatPrice(payment.codCollectedAmount)}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Pending Transit COD</span>
                <span className="text-neutral-300 font-semibold">{payment.codPendingCount} shipments</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. INVENTORY VALUATION REPORT (2.38) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
          <h2 className="text-base font-serif text-[#C9A24A] font-semibold">
            Catalog Inventory &amp; Stock Availability
          </h2>
          <span className="text-xs text-neutral-500 font-mono">SQL RPC: get_inventory_report</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block mb-1">Total Stock</span>
            <div className="text-2xl font-bold text-white">{inventory.totalStock}</div>
            <span className="text-[10px] text-neutral-500">Units on record</span>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block mb-1">Active Holds</span>
            <div className="text-2xl font-bold text-amber-400">{inventory.reservedStock}</div>
            <span className="text-[10px] text-neutral-500">In checkout holds</span>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block mb-1">Available to Sell</span>
            <div className="text-2xl font-bold text-emerald-400">{inventory.availableStock}</div>
            <span className="text-[10px] text-neutral-500">Unreserved copies</span>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block mb-1">Low Stock Titles</span>
            <div className="text-2xl font-bold text-amber-400">{inventory.lowStockCount}</div>
            <span className="text-[10px] text-neutral-500">&le; 5 units remaining</span>
          </div>

          <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
            <span className="text-[10px] uppercase tracking-wider text-neutral-400 block mb-1">Out of Stock</span>
            <div className="text-2xl font-bold text-red-400">{inventory.outOfStockCount}</div>
            <span className="text-[10px] text-neutral-500">0 units in warehouse</span>
          </div>
        </div>
      </section>
    </div>
  );
}
