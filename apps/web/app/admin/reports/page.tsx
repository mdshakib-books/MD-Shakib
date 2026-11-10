import * as React from "react";
import { requireStaffPermission } from "@/lib/admin/auth";
import { AdminNavClient } from "@/app/admin/AdminNavClient";
import { getSalesReport, getPaymentReport, getInventoryValuationReport } from "@/lib/admin/reports";
import { AdminReportsClient } from "./AdminReportsClient";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const admin = await requireStaffPermission("reports.view");

  const [salesReport, paymentReport, inventoryReport] = await Promise.all([
    getSalesReport(),
    getPaymentReport(),
    getInventoryValuationReport(),
  ]);

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-neutral-100 flex flex-col md:flex-row">
      <AdminNavClient currentPath="/admin/reports" userRole={admin.profile.role} />
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        <header className="mb-8 border-b border-neutral-800 pb-5">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#C9A24A]">
            Financial &amp; Operations Reports
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Authoritative sales analytics, courier remittance tracking, inventory valuation, and data export.
          </p>
        </header>

        <AdminReportsClient
          initialSales={salesReport}
          initialPayment={paymentReport}
          initialInventory={inventoryReport}
          adminRole={admin.profile.role}
        />
      </main>
    </div>
  );
}
