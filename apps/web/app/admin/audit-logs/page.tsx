import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminAuditLogs } from "@/lib/admin/audit";
import { AdminAuditLogsClient } from "./AdminAuditLogsClient";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage() {
  await requireAdmin();

  const { logs, total } = await getAdminAuditLogs({ limit: 100 });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Administrative Audit Trail
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Immutable system mutation logs, administrative interventions, and catalog change tracking.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Recorded Events: <span className="font-bold text-white">{total}</span>
        </div>
      </div>

      <AdminAuditLogsClient initialLogs={logs} totalLogs={total} />
    </div>
  );
}

