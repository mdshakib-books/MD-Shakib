"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import {
  updateCustomerAccountStatus,
  getAdminCustomerDetails,
  type CustomerListItem,
  type CustomerDetails,
} from "@/lib/admin/customers";

interface AdminUsersClientProps {
  initialCustomers: CustomerListItem[];
  totalCustomers: number;
  currentAdminId: string;
}

export function AdminUsersClient({
  initialCustomers,
  totalCustomers,
  currentAdminId,
}: AdminUsersClientProps) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED" | "DELETED">("ALL");

  // Selected customer for details drawer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Status Action Modal (Block / Unblock / Soft Delete / Restore)
  const [actionTarget, setActionTarget] = useState<{
    customer: CustomerListItem;
    action: "BLOCK" | "UNBLOCK" | "SOFT_DELETE" | "RESTORE";
  } | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const openCustomerDetails = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setIsLoadingDetails(true);
    setCustomerDetails(null);

    try {
      const details = await getAdminCustomerDetails(customerId);
      setCustomerDetails(details);
    } catch (err) {
      console.error("Failed to load customer details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleExecuteStatusAction = async () => {
    if (!actionTarget) return;
    setActionError(null);
    setIsProcessingAction(true);

    try {
      const res = await updateCustomerAccountStatus({
        customerId: actionTarget.customer.id,
        action: actionTarget.action,
      });

      if (!res.success) {
        throw new Error(res.error);
      }

      setActionTarget(null);
      router.refresh();
    } catch (err: any) {
      setActionError(err?.message || "Failed to update account status.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const filteredCustomers = initialCustomers.filter((user) => {
    const matchesSearch =
      search.trim() === "" ||
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase()) ||
      user.phone?.includes(search);

    const matchesRole = roleFilter === "ALL" || user.role === roleFilter;

    let matchesStatus = true;
    if (statusFilter === "ACTIVE") matchesStatus = !user.is_blocked && !user.is_deleted;
    else if (statusFilter === "BLOCKED") matchesStatus = user.is_blocked;
    else if (statusFilter === "DELETED") matchesStatus = user.is_deleted;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <svg
            className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by customer name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-xs text-gray-200 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Roles</option>
            <option value="user">Customers</option>
            <option value="admin">Administrators</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-xs text-gray-200 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Account Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="BLOCKED">Blocked</option>
            <option value="DELETED">Soft-Deleted</option>
          </select>
        </div>
      </div>

      {/* Customer Accounts Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No customer accounts matched.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">User</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Orders / Spent</th>
                  <th className="py-3.5 px-4">Account Status</th>
                  <th className="py-3.5 px-4">Joined</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {filteredCustomers.map((user) => {
                  const isSelf = user.id === currentAdminId;

                  return (
                    <tr key={user.id} className="hover:bg-[#161616]/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#1F1F1F] text-gray-300 font-bold text-xs flex items-center justify-center border border-[#2A2A2A]">
                            {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>{user.name || "Customer"}</span>
                              {isSelf && (
                                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-gray-500">
                              {user.id.slice(0, 13)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-gray-300 text-xs">{user.email || "—"}</div>
                        {user.phone && (
                          <div className="text-[11px] text-gray-500">{user.phone}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={user.role === "admin" ? "gold" : "muted"}>
                          {user.role}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white text-xs">
                          {user.ordersCount} {user.ordersCount === 1 ? "order" : "orders"}
                        </div>
                        <div className="text-[11px] text-[var(--color-primary-gold,#C9A24A)]">
                          {formatPrice(user.totalSpent)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {user.is_deleted ? (
                          <Badge variant="danger">Soft-Deleted</Badge>
                        ) : user.is_blocked ? (
                          <Badge variant="danger">Blocked</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-400">
                        {new Date(user.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openCustomerDetails(user.id)}
                            className="px-2 py-1 text-xs text-gray-300 hover:text-white rounded bg-[#181818] border border-[#282828] transition"
                          >
                            Profile
                          </button>

                          {!isSelf && (
                            <>
                              {user.is_blocked ? (
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ customer: user, action: "UNBLOCK" })}
                                  className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-950/50 rounded border border-emerald-900 transition"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ customer: user, action: "BLOCK" })}
                                  className="px-2 py-1 text-xs text-amber-400 hover:bg-amber-950/50 rounded border border-amber-900 transition"
                                >
                                  Block
                                </button>
                              )}

                              {user.is_deleted ? (
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ customer: user, action: "RESTORE" })}
                                  className="px-2 py-1 text-xs text-blue-400 hover:bg-blue-950/50 rounded border border-blue-900 transition"
                                >
                                  Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setActionTarget({ customer: user, action: "SOFT_DELETE" })}
                                  className="px-2 py-1 text-xs text-red-400 hover:bg-red-950/50 rounded border border-red-900 transition"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CUSTOMER DETAILS MODAL */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-[#262626] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Customer Profile & Order History</h3>
                <p className="text-xs text-gray-400 mt-0.5">Authoritative user snapshot</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerId(null)}
                className="text-gray-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {isLoadingDetails ? (
                <div className="p-12 text-center text-xs text-gray-400">Loading customer profile...</div>
              ) : !customerDetails ? (
                <div className="p-12 text-center text-xs text-red-400">Customer details unavailable.</div>
              ) : (
                <>
                  {/* Summary Bar */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-[#161616] rounded-xl border border-[#282828] text-center">
                    <div>
                      <div className="text-[11px] text-gray-400 uppercase">Total Orders</div>
                      <div className="text-lg font-bold text-white mt-1">
                        {customerDetails.metrics.totalOrders}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 uppercase">Settled Spend</div>
                      <div className="text-lg font-bold text-[var(--color-primary-gold,#C9A24A)] mt-1">
                        {formatPrice(customerDetails.metrics.totalSpent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-400 uppercase">Account Status</div>
                      <div className="text-sm font-bold text-white mt-1">
                        {customerDetails.is_blocked
                          ? "Blocked"
                          : customerDetails.is_deleted
                          ? "Deleted"
                          : "Active"}
                      </div>
                    </div>
                  </div>

                  {/* Contact & Profile */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Personal Information
                    </h4>
                    <div className="p-3 bg-[#181818] rounded-lg border border-[#282828] text-xs space-y-1">
                      <div>Name: <span className="font-semibold text-white">{customerDetails.name}</span></div>
                      <div>Email: <span className="font-semibold text-white">{customerDetails.email}</span></div>
                      <div>Phone: <span className="font-semibold text-white">{customerDetails.phone || "Not provided"}</span></div>
                    </div>
                  </div>

                  {/* Saved Addresses */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Saved Delivery Addresses ({customerDetails.addresses.length})
                    </h4>
                    {customerDetails.addresses.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No saved addresses.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {customerDetails.addresses.map((addr) => (
                          <div
                            key={addr.id}
                            className="p-3 bg-[#161616] rounded-lg border border-[#262626] text-xs space-y-0.5"
                          >
                            <div className="font-semibold text-white flex items-center justify-between">
                              <span>{addr.fullName}</span>
                              {addr.isDefault && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 rounded">Default</span>
                              )}
                            </div>
                            <div className="text-gray-400">{addr.phone}</div>
                            <div className="text-gray-400">{addr.houseNo}, {addr.area}</div>
                            <div className="text-gray-400">{addr.city}, {addr.state} - {addr.pincode}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Order History */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Order History ({customerDetails.orders.length})
                    </h4>
                    {customerDetails.orders.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No orders placed by this customer.</p>
                    ) : (
                      <div className="space-y-2">
                        {customerDetails.orders.map((ord) => (
                          <div
                            key={ord.id}
                            className="p-3 bg-[#161616] rounded-lg border border-[#262626] flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-mono font-semibold text-white">
                                #{ord.id.slice(0, 8)}
                              </div>
                              <div className="text-gray-500 text-[11px]">
                                {new Date(ord.createdAt).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })} • {ord.paymentMethod}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-[var(--color-primary-gold,#C9A24A)]">
                                {formatPrice(ord.totalAmount)}
                              </div>
                              <div className="text-[11px] text-gray-400">{ord.orderStatus}</div>
                            </div>
                            <Link
                              href={`/admin/orders/${ord.id}`}
                              target="_blank"
                              className="text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline ml-2"
                            >
                              Inspect →
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STATUS ACTION CONFIRMATION MODAL */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">
              Confirm Account Action: {actionTarget.action}
            </h3>

            {actionError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg mb-3">
                {actionError}
              </div>
            )}

            <p className="text-xs text-gray-300 mb-4">
              Are you sure you want to {actionTarget.action.toLowerCase().replace("_", " ")} account{" "}
              <span className="font-bold text-white">
                &ldquo;{actionTarget.customer.name || actionTarget.customer.email}&rdquo;
              </span>
              ?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={handleExecuteStatusAction}
                className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-600 rounded-lg disabled:opacity-50"
              >
                {isProcessingAction ? "Processing..." : `Confirm ${actionTarget.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
