"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { AuditLogRow } from "@/lib/admin/audit";

interface EnrichedLog extends AuditLogRow {
  adminEmail?: string;
  adminName?: string;
}

interface AdminAuditLogsClientProps {
  initialLogs: EnrichedLog[];
  totalLogs: number;
}

export function AdminAuditLogsClient({ initialLogs, totalLogs }: AdminAuditLogsClientProps) {
  const [modelFilter, setModelFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [inspectingLog, setInspectingLog] = useState<EnrichedLog | null>(null);

  const filteredLogs = initialLogs.filter((log) => {
    const matchesModel = modelFilter === "ALL" || log.model_name === modelFilter;
    const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
    return matchesModel && matchesAction;
  });

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("CREATE") || action.includes("APPROVE")) return "success";
    if (action.includes("DELETE") || action.includes("REJECT") || action.includes("CANCEL")) return "danger";
    if (action.includes("UPDATE")) return "gold";
    return "muted";
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="px-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-xs text-gray-200 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Entities</option>
            <option value="books">Books</option>
            <option value="inventory">Inventory</option>
            <option value="categories">Categories</option>
            <option value="orders">Orders</option>
            <option value="profiles">Customers / Profiles</option>
            <option value="reviews">Reviews</option>
            <option value="discounts">Discounts</option>
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-xs text-gray-200 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="SOFT_DELETE">SOFT_DELETE</option>
            <option value="RESTORE">RESTORE</option>
          </select>
        </div>

        <div className="text-xs text-gray-400">
          Showing <span className="font-bold text-white">{filteredLogs.length}</span> of {totalLogs} events
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No audit events match current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Entity</th>
                  <th className="py-3.5 px-4">Entity ID</th>
                  <th className="py-3.5 px-4">Admin</th>
                  <th className="py-3.5 px-4">Changes Summary</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#161616]/40 transition">
                    <td className="py-3.5 px-4 text-xs font-mono text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>

                    <td className="py-3.5 px-4">
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {log.action}
                      </Badge>
                    </td>

                    <td className="py-3.5 px-4 text-xs font-semibold text-white capitalize">
                      {log.model_name}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-gray-400">
                      {log.model_id ? `${log.model_id.slice(0, 10)}...` : "—"}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-gray-300">
                      {log.adminEmail || log.adminName || "System / Service"}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-gray-400 max-w-xs truncate font-mono">
                      {log.changes ? JSON.stringify(log.changes) : "—"}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setInspectingLog(log)}
                        className="px-2.5 py-1 text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline rounded bg-[#181818] border border-[#282828] transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INSPECT LOG MODAL */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-[#262626] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Audit Log Inspection</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  ID: <span className="font-mono text-gray-300">{inspectingLog.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="text-gray-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-[#181818] rounded-lg border border-[#282828]">
                <div>Action: <strong className="text-white">{inspectingLog.action}</strong></div>
                <div>Entity: <strong className="text-white capitalize">{inspectingLog.model_name}</strong></div>
                <div>Model ID: <strong className="text-white font-mono">{inspectingLog.model_id || "—"}</strong></div>
                <div>Admin: <strong className="text-white">{inspectingLog.adminEmail || inspectingLog.user_id}</strong></div>
                <div>Timestamp: <strong className="text-white">{new Date(inspectingLog.created_at).toLocaleString("en-IN")}</strong></div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-1">Changes:</h4>
                <pre className="p-3 bg-[#161616] rounded-lg border border-[#262626] text-emerald-400 overflow-x-auto text-[11px] font-mono">
                  {JSON.stringify(inspectingLog.changes, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-1">Previous Values (old_values):</h4>
                <pre className="p-3 bg-[#161616] rounded-lg border border-[#262626] text-amber-300 overflow-x-auto text-[11px] font-mono">
                  {JSON.stringify(inspectingLog.old_values, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-300 mb-1">Resulting Values (new_values):</h4>
                <pre className="p-3 bg-[#161616] rounded-lg border border-[#262626] text-blue-300 overflow-x-auto text-[11px] font-mono">
                  {JSON.stringify(inspectingLog.new_values, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-[#262626] flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingLog(null)}
                className="px-4 py-1.5 text-xs font-semibold text-gray-300 bg-[#1A1A1A] hover:bg-[#222222] rounded-lg border border-[#2E2E2E]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

