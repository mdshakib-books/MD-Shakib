"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdminReturnsClientProps {
  initialReturns: any[];
  adminRole: string;
}

export function AdminReturnsClient({ initialReturns, adminRole }: AdminReturnsClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState<string>("");

  const filtered = initialReturns.filter((r) => {
    if (filter === "all") return true;
    return r.status === filter;
  });

  const handleReviewAction = async (action: "approve" | "reject" | "request_info") => {
    if (!selectedReturn) return;
    if (action === "reject" && !rejectionReason.trim()) {
      alert("Please provide a rejection reason.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/returns/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnId: selectedReturn.id,
          action,
          rejectionReason,
          adminNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Action failed");
      }

      alert(`Return request successfully ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "updated"}.`);
      setSelectedReturn(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Error updating return status");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSchedulePickup = async () => {
    if (!selectedReturn) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/admin/returns/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnId: selectedReturn.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Pickup scheduling failed");
      }

      alert(`Delhivery return pickup scheduled! AWB: ${data.pickupAwb}`);
      setSelectedReturn(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Error scheduling pickup");
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!selectedReturn) return;
    if (!confirm(`Are you sure you want to authorize refund of ₹${selectedReturn.refund_amount}?`)) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/returns/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnId: selectedReturn.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Refund processing failed");
      }

      alert(`Refund of ₹${data.amount} processed successfully via gateway (ID: ${data.gatewayRefundId || "N/A"}).`);
      setSelectedReturn(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Error processing refund");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-neutral-800 text-xs">
        {[
          { label: "All Claims", value: "all" },
          { label: "Submitted", value: "submitted" },
          { label: "Approved", value: "approved" },
          { label: "Pickup Scheduled", value: "pickup_scheduled" },
          { label: "Completed", value: "completed" },
          { label: "Rejected", value: "rejected" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === tab.value
                ? "bg-[#C9A24A] text-black font-semibold"
                : "bg-[#161616] text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs text-neutral-300">
          <thead className="bg-[#111111] border-b border-neutral-800 text-[11px] uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="p-3.5">Return #</th>
              <th className="p-3.5">Order Ref</th>
              <th className="p-3.5">Type</th>
              <th className="p-3.5">Items</th>
              <th className="p-3.5">Reason</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-neutral-500">
                  No return requests found.
                </td>
              </tr>
            ) : (
              filtered.map((ret) => (
                <tr key={ret.id} className="hover:bg-neutral-850 transition">
                  <td className="p-3.5 font-mono font-semibold text-white">{ret.return_number}</td>
                  <td className="p-3.5 font-mono text-neutral-400">{ret.orders?.order_number || ret.order_id.slice(0, 8)}</td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-950/60 border border-blue-800/40 text-blue-300">
                      Return & Refund
                    </span>
                  </td>
                  <td className="p-3.5">{ret.return_request_items?.length || 1} item(s)</td>
                  <td className="p-3.5 max-w-xs truncate">{ret.reason}</td>
                  <td className="p-3.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                        ret.status === "completed"
                          ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                          : ret.status === "rejected"
                          ? "bg-red-950/60 text-red-400 border border-red-800/40"
                          : ret.status === "approved"
                          ? "bg-amber-950/60 text-amber-300 border border-amber-800/40"
                          : "bg-neutral-800 text-neutral-300"
                      }`}
                    >
                      {ret.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => setSelectedReturn(ret)}
                      className="px-3 py-1.5 bg-[#C9A24A]/10 hover:bg-[#C9A24A]/20 border border-[#C9A24A]/30 text-[#C9A24A] rounded text-[11px] font-semibold transition"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer / Review Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#161616] border border-neutral-700 rounded-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Return Claim</span>
                <h3 className="font-mono text-lg font-bold text-white">{selectedReturn.return_number}</h3>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-neutral-300">
              <div>
                <p className="text-neutral-500 mb-0.5">Order Number</p>
                <p className="font-semibold text-white">{selectedReturn.orders?.order_number || selectedReturn.order_id}</p>
              </div>
              <div>
                <p className="text-neutral-500 mb-0.5">Claim Type</p>
                <p className="font-semibold uppercase text-[#E5C87B]">{selectedReturn.request_type}</p>
              </div>
              <div>
                <p className="text-neutral-500 mb-0.5">Customer Reason</p>
                <p className="text-white">{selectedReturn.reason}</p>
              </div>
              <div>
                <p className="text-neutral-500 mb-0.5">Estimated Refund</p>
                <p className="font-bold text-emerald-400">₹{selectedReturn.refund_amount}</p>
              </div>
            </div>

            {selectedReturn.description && (
              <div className="p-3 bg-[#0B0B0B] border border-neutral-800 rounded-lg text-xs text-neutral-300">
                <span className="text-neutral-500 block mb-1">Customer Description:</span>
                {selectedReturn.description}
              </div>
            )}

            {/* Evidence URLs */}
            {selectedReturn.evidence_urls?.length > 0 && (
              <div>
                <p className="text-xs text-neutral-400 mb-2">Attached Photo Evidence:</p>
                <div className="flex gap-2">
                  {selectedReturn.evidence_urls.map((url: string, idx: number) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#C9A24A] hover:underline bg-[#0B0B0B] px-3 py-1.5 rounded border border-neutral-800"
                    >
                      Photo {idx + 1} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions depending on status */}
            <div className="border-t border-neutral-800 pt-4 space-y-4">
              {selectedReturn.status === "submitted" && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="rejection-reason" className="block text-xs text-neutral-400 mb-1">Rejection Reason (If rejecting)</label>
                    <input
                      id="rejection-reason"
                      type="text"
                      placeholder="e.g. Beyond return window, no defect found"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full bg-[#0B0B0B] border border-neutral-700 rounded px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReviewAction("approve")}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 bg-[#C9A24A] hover:bg-[#B89139] text-black font-semibold text-xs rounded-lg transition"
                    >
                      Approve Claim
                    </button>
                    <button
                      onClick={() => handleReviewAction("reject")}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 bg-red-950 hover:bg-red-900 border border-red-700 text-red-300 font-semibold text-xs rounded-lg transition"
                    >
                      Reject Claim
                    </button>
                  </div>
                </div>
              )}

              {selectedReturn.status === "approved" && (
                <div className="flex gap-3">
                  <button
                    onClick={handleSchedulePickup}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-neutral-700 text-white font-semibold text-xs rounded-lg transition"
                  >
                    Schedule Delhivery Reverse Pickup
                  </button>
                  {selectedReturn.request_type === "return_refund" && (
                    <button
                      onClick={handleProcessRefund}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs rounded-lg transition"
                    >
                      Authorize Gateway Refund (₹{selectedReturn.refund_amount})
                    </button>
                  )}
                </div>
              )}

              {selectedReturn.status === "pickup_scheduled" && (
                <div className="space-y-3">
                  <div className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs flex justify-between items-center">
                    <span>Delhivery Reverse AWB:</span>
                    <span className="font-mono font-bold text-white">{selectedReturn.pickup_awb}</span>
                  </div>
                  {selectedReturn.request_type === "return_refund" && (
                    <button
                      onClick={handleProcessRefund}
                      disabled={actionLoading}
                      className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs rounded-lg transition"
                    >
                      Authorize Gateway Refund (₹{selectedReturn.refund_amount})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
