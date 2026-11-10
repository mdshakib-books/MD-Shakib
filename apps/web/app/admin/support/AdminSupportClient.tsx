"use client";

import * as React from "react";
import { Badge } from "@/components/ui/Badge";
import type { SupportTicket, TicketStatus, TicketPriority } from "@/lib/support/tickets";

interface AdminSupportClientProps {
  initialTickets: SupportTicket[];
  initialTotal: number;
  adminId: string;
  adminRole: string;
}

export function AdminSupportClient({ initialTickets, initialTotal, adminId, adminRole }: AdminSupportClientProps) {
  const [tickets, setTickets] = React.useState<SupportTicket[]>(initialTickets);
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [submittingReply, setSubmittingReply] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  const fetchTicketDetails = async (ticketId: string) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();
      if (data.ticket) {
        setSelectedTicket(data.ticket);
      }
    } catch (err) {
      console.error("Failed to load ticket details:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
        setTickets((prev) =>
          prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: newStatus } : t))
        );
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim() || submittingReply) return;

    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        setReplyText("");
        setSelectedTicket((prev) =>
          prev
            ? {
                ...prev,
                status: prev.status === "open" ? "in_progress" : prev.status,
                messages: [...(prev.messages || []), data.message],
              }
            : null
        );
      }
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const filteredTickets = tickets.filter((t) =>
    statusFilter === "ALL" ? true : t.status === statusFilter
  );

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="warning">Open</Badge>;
      case "in_progress":
        return <Badge variant="info">In Progress</Badge>;
      case "waiting_customer":
        return <Badge variant="muted">Waiting for Customer</Badge>;
      case "resolved":
        return <Badge variant="success">Resolved</Badge>;
      case "closed":
        return <Badge variant="danger">Closed</Badge>;
      default:
        return <Badge variant="muted">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#141414] border border-[#2A2A2A] rounded-xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-medium">Status Filter:</span>
          {["ALL", "open", "in_progress", "waiting_customer", "resolved", "closed"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-colors ${
                statusFilter === st
                  ? "bg-[#C9A24A] text-black"
                  : "bg-[#1C1C1C] text-neutral-400 hover:text-white"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="text-xs text-neutral-500">
          Showing {filteredTickets.length} of {tickets.length} tickets
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1 space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-8 text-center text-xs text-neutral-500">
              No support tickets found matching current filter.
            </div>
          ) : (
            filteredTickets.map((t) => {
              const isSelected = selectedTicket?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTicket(t);
                    fetchTicketDetails(t.id);
                  }}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                    isSelected
                      ? "bg-[#1C1C1C] border-[#C9A24A] shadow-md"
                      : "bg-[#141414] border-[#2A2A2A] hover:border-neutral-600"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs text-[#C9A24A] font-semibold">{t.ticketNumber}</span>
                    {renderStatusBadge(t.status)}
                  </div>
                  <div className="text-xs font-medium text-white line-clamp-1 mb-1">{t.subject}</div>
                  <div className="text-[11px] text-neutral-400 mb-2">{t.customerName || t.customerEmail || "Customer"}</div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-[#2A2A2A]">
                    <span className="uppercase tracking-wider font-medium text-neutral-400">{t.category}</span>
                    <span className="capitalize">{t.priority} priority</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Ticket Detail & Communication Pane */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 flex flex-col h-[700px]">
              {/* Header */}
              <div className="pb-4 border-b border-[#2A2A2A]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#C9A24A] font-bold">{selectedTicket.ticketNumber}</span>
                    {renderStatusBadge(selectedTicket.status)}
                    <span className="text-[10px] uppercase font-bold text-neutral-300 px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#2A2A2A]">
                      {selectedTicket.category}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-neutral-400">Set Status:</label>
                    <select
                      value={selectedTicket.status}
                      disabled={updatingStatus}
                      onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                      className="bg-[#1C1C1C] border border-[#2A2A2A] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#C9A24A]"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting_customer">Waiting for Customer</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                <h2 className="text-base font-semibold text-white mb-1">{selectedTicket.subject}</h2>
                <div className="flex items-center gap-4 text-xs text-neutral-400">
                  <span>Customer: <strong className="text-neutral-200">{selectedTicket.customerName || selectedTicket.customerEmail}</strong></span>
                  {selectedTicket.orderNumber && (
                    <span>Linked Order: <strong className="text-neutral-200">#{selectedTicket.orderNumber}</strong></span>
                  )}
                  <span>Created: {new Date(selectedTicket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Message thread */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {loadingDetails ? (
                  <div className="text-center py-12 text-xs text-neutral-500">Loading messages...</div>
                ) : (
                  selectedTicket.messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.isStaff ? "items-end" : "items-start"}`}
                    >
                      <div className="text-[10px] text-neutral-400 mb-1 px-1">
                        {msg.isStaff ? "Staff Reply" : selectedTicket.customerName || "Customer"} •{" "}
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                          msg.isStaff
                            ? "bg-[#C9A24A]/10 border border-[#C9A24A]/30 text-white"
                            : "bg-[#1C1C1C] border border-[#2A2A2A] text-neutral-200"
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Staff Reply Form */}
              <form onSubmit={handleSendReply} className="pt-3 border-t border-[#2A2A2A] flex gap-2">
                <input
                  type="text"
                  placeholder="Type official staff response to the customer..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#C9A24A]"
                />
                <button
                  type="submit"
                  disabled={submittingReply || !replyText.trim()}
                  className="px-5 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] disabled:opacity-50 transition-colors"
                >
                  {submittingReply ? "Posting..." : "Send Staff Reply"}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-12 text-center text-neutral-500 text-xs h-[300px] flex items-center justify-center">
              Select a customer inquiry from the left to view full history and respond.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
