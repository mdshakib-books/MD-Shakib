import * as React from "react";
import { requireStaffPermission } from "@/lib/admin/auth";
import { AdminNavClient } from "@/app/admin/AdminNavClient";
import { getAdminSupportTickets } from "@/lib/support/tickets";
import { AdminSupportClient } from "./AdminSupportClient";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const admin = await requireStaffPermission("orders.manage");
  const { tickets, total } = await getAdminSupportTickets({ limit: 50 });

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-neutral-100 flex flex-col md:flex-row">
      <AdminNavClient currentPath="/admin/support" userRole={admin.profile.role} />
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        <header className="mb-8 border-b border-neutral-800 pb-5">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#C9A24A]">
            Customer Support Desk
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Resolve customer tickets, triage order delivery disputes, and correspond directly with readers.
          </p>
        </header>

        <AdminSupportClient
          initialTickets={tickets}
          initialTotal={total}
          adminId={admin.user.id}
          adminRole={admin.profile.role}
        />
      </main>
    </div>
  );
}
