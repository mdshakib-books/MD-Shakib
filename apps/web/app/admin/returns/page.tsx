import * as React from "react";
import { requireStaffPermission } from "@/lib/admin/auth";
import { AdminNavClient } from "@/app/admin/AdminNavClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminReturnsClient } from "./AdminReturnsClient";

export const dynamic = "force-dynamic";

export default async function AdminReturnsPage() {
  const admin = await requireStaffPermission("orders.manage");
  const adminDb = createAdminClient();

  // Fetch return requests with related order and items
  const { data: returns } = await adminDb
    .from("return_requests")
    .select("*, return_request_items(*), orders(order_number, total_amount, payment_method, payment_status, address_snapshot)")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-neutral-100 flex flex-col md:flex-row">
      <AdminNavClient currentPath="/admin/returns" userRole={admin.profile.role} />
      <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full">
        <header className="mb-8 border-b border-neutral-800 pb-5">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#C9A24A]">
            Returns &amp; Replacements
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Review customer claims, schedule courier reverse pickups, and authorize gateway refunds.
          </p>
        </header>

        <AdminReturnsClient initialReturns={returns || []} adminRole={admin.profile.role} />
      </main>
    </div>
  );
}
