import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminCustomers } from "@/lib/admin/customers";
import { AdminUsersClient } from "./AdminUsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { user } = await requireAdmin();

  const { customers, total } = await getAdminCustomers({ limit: 100 });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Customer Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Registered customer accounts, contact directories, purchasing history, and security controls.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Customers: <span className="font-bold text-white">{total}</span>
        </div>
      </div>

      <AdminUsersClient
        initialCustomers={customers}
        totalCustomers={total}
        currentAdminId={user.id}
      />
    </div>
  );
}
