import * as React from "react";
import { requireStaffPermission } from "@/lib/admin/auth";
import { AdminNavClient } from "@/app/admin/AdminNavClient";
import { DeliveryVerificationClient } from "./DeliveryVerificationClient";

export const dynamic = "force-dynamic";

export default async function DeliveryVerificationPage() {
  const admin = await requireStaffPermission("orders.ship");

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-neutral-100 flex flex-col md:flex-row">
      <AdminNavClient currentPath="/admin/delivery-verification" userRole={admin.profile.role} />
      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full">
        <header className="mb-8 border-b border-neutral-800 pb-5">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#C9A24A]">
            Delivery Verification & Handover
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Authoritative OTP verification and Cash On Delivery (COD) collection terminal.
          </p>
        </header>
        <DeliveryVerificationClient adminRole={admin.profile.role} />
      </main>
    </div>
  );
}
