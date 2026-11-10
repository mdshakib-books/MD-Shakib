"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Badge } from "@/components/ui/Badge";
import type { SupportTicket, TicketCategory, TicketPriority } from "@/lib/support/tickets";

interface AccountSupportClientProps {
  customerId: string;
  initialTickets: SupportTicket[];
}

export function AccountSupportClient({ customerId, initialTickets }: AccountSupportClientProps) {
  const searchParams = useSearchParams();
  const prefillOrderId = searchParams.get("orderId");

  const [tickets, setTickets] = React.useState<SupportTicket[]>(initialTickets);
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null);
  const [isCreating, setIsCreating] = React.useState(Boolean(prefillOrderId));
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");
  const [submittingReply, setSubmittingReply] = React.useState(false);

  // New ticket state
  const [category, setCategory] = React.useState<TicketCategory>(prefillOrderId ? "order" : "general");
  const [orderId, setOrderId] = React.useState(prefillOrderId || "");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<TicketPriority>("medium");
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const fetchTicketDetails = async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();
      if (data.ticket) {
        setSelectedTicket(data.ticket);
      }
    } catch (err) {
      console.error("Failed to load ticket details:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          description,
          priority,
          orderId: orderId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed to create ticket.");
        return;
      }

      setTickets((prev) => [data.ticket, ...prev]);
      setIsCreating(false);
      setSubject("");
      setDescription("");
      setSelectedTicket(data.ticket);
      fetchTicketDetails(data.ticket.id);
    } catch (err: any) {
      setCreateError(err.message || "Network error");
    } finally {
      setCreateLoading(false);
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
                messages: [...(prev.messages || []), data.message],
              }
            : null
        );
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="warning">Open</Badge>;
      case "in_progress":
        return <Badge variant="info">In Progress</Badge>;
      case "waiting_customer":
        return <Badge variant="muted">Waiting for You</Badge>;
      case "resolved":
        return <Badge variant="success">Resolved</Badge>;
      case "closed":
        return <Badge variant="danger">Closed</Badge>;
      default:
        return <Badge variant="muted">{status}</Badge>;
    }
  };

  return (
    <PageContainer size="lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Customer Support Center
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Open inquiries, track resolutions, and communicate directly with the MD Shakib operations desk.
          </p>
        </div>

        {!isCreating && (
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setSelectedTicket(null);
            }}
            className="px-4 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] transition-colors"
          >
            + Create New Ticket
          </button>
        )}
      </div>

      <AccountNav />

      {isCreating ? (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 max-w-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-6">
            <h2 className="text-lg font-serif text-[#C9A24A]">New Support Inquiry</h2>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-xs text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
          </div>

          {createError && (
            <div className="p-3 mb-4 rounded bg-red-950/50 border border-red-500/30 text-red-200 text-xs">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Inquiry Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A24A]"
                >
                  <option value="order">Order Issues</option>
                  <option value="delivery">Delivery / Shipping</option>
                  <option value="payment">Payment & Refunds</option>
                  <option value="return">Returns & Replacements</option>
                  <option value="product">Product Inquiries</option>
                  <option value="general">General Support</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A24A]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Order ID (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Subject</label>
              <input
                type="text"
                required
                placeholder="Brief summary of your inquiry"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Description & Details</label>
              <textarea
                required
                rows={4}
                placeholder="Describe your request or issue with full detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 border border-[#2A2A2A] text-neutral-300 rounded-lg text-xs hover:bg-[#1C1C1C]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="px-5 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] disabled:opacity-50"
              >
                {createLoading ? "Submitting..." : "Submit Ticket"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ticket List */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-2">
              Inquiry History ({tickets.length})
            </h2>

            {tickets.length === 0 ? (
              <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-8 text-center text-xs text-neutral-500">
                No support tickets found. Click &quot;Create New Ticket&quot; above to reach out to our team.
              </div>
            ) : (
              tickets.map((t) => {
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
                      <span className="font-mono text-[11px] text-[#C9A24A]">{t.ticketNumber}</span>
                      {renderStatusBadge(t.status)}
                    </div>
                    <div className="text-xs font-medium text-white line-clamp-1 mb-1">{t.subject}</div>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400">
                      <span className="uppercase tracking-wider">{t.category}</span>
                      <span>{new Date(t.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Ticket Conversation View */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-6 flex flex-col h-[650px]">
                {/* Header */}
                <div className="pb-4 border-b border-[#2A2A2A] flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-[#C9A24A]">{selectedTicket.ticketNumber}</span>
                      {renderStatusBadge(selectedTicket.status)}
                      <span className="text-[10px] uppercase font-semibold text-neutral-400 px-2 py-0.5 rounded bg-[#1C1C1C] border border-[#2A2A2A]">
                        {selectedTicket.category}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-white">{selectedTicket.subject}</h2>
                    {selectedTicket.orderNumber && (
                      <p className="text-xs text-neutral-400 mt-0.5">
                        Linked Order: <span className="text-neutral-200">#{selectedTicket.orderNumber}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Messages Thread */}
                <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                  {loadingMessages ? (
                    <div className="text-center py-12 text-xs text-neutral-500">Loading conversation...</div>
                  ) : (
                    selectedTicket.messages?.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.isStaff ? "items-start" : "items-end"}`}
                      >
                        <div className="text-[10px] text-neutral-400 mb-1 px-1">
                          {msg.isStaff ? "MD Shakib Staff" : "You"} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div
                          className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                            msg.isStaff
                              ? "bg-[#1C1C1C] border border-[#C9A24A]/40 text-neutral-200"
                              : "bg-[#C9A24A]/10 border border-[#C9A24A]/30 text-white"
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== "closed" ? (
                  <form onSubmit={handleSendReply} className="pt-3 border-t border-[#2A2A2A] flex gap-2">
                    <input
                      type="text"
                      placeholder="Type your response to support staff..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#C9A24A]"
                    />
                    <button
                      type="submit"
                      disabled={submittingReply || !replyText.trim()}
                      className="px-4 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] disabled:opacity-50"
                    >
                      {submittingReply ? "Sending..." : "Reply"}
                    </button>
                  </form>
                ) : (
                  <div className="pt-3 border-t border-[#2A2A2A] text-center text-xs text-neutral-500">
                    This support ticket has been closed. Please create a new inquiry if further assistance is needed.
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl p-12 text-center text-neutral-500 text-xs h-[300px] flex items-center justify-center">
                Select an inquiry from the list on the left to view the thread and communicate with our team.
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
