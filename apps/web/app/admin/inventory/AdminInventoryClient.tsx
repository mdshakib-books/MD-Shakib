"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import {
  adjustAdminStock,
  getInventoryAdjustmentHistory,
  type InventoryItem,
  type InventoryAdjustmentRow,
} from "@/lib/admin/inventory";

interface AdminInventoryClientProps {
  initialItems: InventoryItem[];
  totalItems: number;
  summary: {
    totalItems: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalUnits: number;
  };
}

export function AdminInventoryClient({
  initialItems,
  totalItems,
  summary,
}: AdminInventoryClientProps) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "LOW" | "OUT">("ALL");

  // Adjustment Modal
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustType, setAdjustType] = useState<"INCREASE" | "DECREASE" | "SET">("INCREASE");
  const [adjustQty, setAdjustQty] = useState(10);
  const [adjustReason, setAdjustReason] = useState("Restock shipment received from supplier");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // History Drawer
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<
    Array<
      InventoryAdjustmentRow & {
        bookTitle?: string;
        adminEmail?: string;
      }
    >
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const openAdjustModal = (item: InventoryItem) => {
    setAdjustingItem(item);
    setAdjustType("INCREASE");
    setAdjustQty(10);
    setAdjustReason("Restock shipment received from supplier");
    setAdjustError(null);
  };

  const openHistoryDrawer = async (item: InventoryItem) => {
    setHistoryItem(item);
    setIsLoadingHistory(true);
    try {
      const logs = await getInventoryAdjustmentHistory({ bookId: item.id, limit: 20 });
      setHistoryLogs(logs);
    } catch (err) {
      console.error("Failed to load adjustment history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;
    setAdjustError(null);
    setIsSubmitting(true);

    try {
      const res = await adjustAdminStock({
        bookId: adjustingItem.id,
        type: adjustType,
        quantity: adjustQty,
        reason: adjustReason,
      });

      if (!res.success) {
        throw new Error(res.error);
      }

      setAdjustingItem(null);
      router.refresh();
    } catch (err: any) {
      setAdjustError(err?.message || "Failed to adjust stock.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items locally
  const filteredItems = initialItems.filter((item) => {
    const matchesSearch =
      search.trim() === "" ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.author.toLowerCase().includes(search.toLowerCase());

    let matchesTab = true;
    if (filterTab === "LOW") matchesTab = item.stock > 0 && item.stock <= 5;
    else if (filterTab === "OUT") matchesTab = item.stock === 0;

    return matchesSearch && matchesTab;
  });

  // Calculate projected stock in modal
  let projectedStock = adjustingItem?.stock ?? 0;
  if (adjustingItem) {
    if (adjustType === "INCREASE") projectedStock += adjustQty;
    else if (adjustType === "DECREASE") projectedStock = Math.max(0, projectedStock - adjustQty);
    else if (adjustType === "SET") projectedStock = adjustQty;
  }

  return (
    <div className="space-y-6">
      {/* Top Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
            Total Inventory Units
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {summary.totalUnits.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">Across {summary.totalItems} titles</div>
        </div>

        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
            Catalog Titles
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{summary.totalItems}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Managed bookstore items</div>
        </div>

        <div
          onClick={() => setFilterTab("LOW")}
          className="bg-[#111111] border border-[#2A2A2A] hover:border-amber-600/50 rounded-xl p-4 cursor-pointer transition"
        >
          <div className="text-xs uppercase tracking-wider text-amber-400 font-semibold flex items-center justify-between">
            <span>Low Stock Alerts</span>
            <span>≤ 5</span>
          </div>
          <div className="text-2xl font-bold text-amber-300 mt-2">{summary.lowStockCount}</div>
          <div className="text-[11px] text-amber-500/80 mt-0.5">Click to filter view</div>
        </div>

        <div
          onClick={() => setFilterTab("OUT")}
          className="bg-[#111111] border border-[#2A2A2A] hover:border-red-600/50 rounded-xl p-4 cursor-pointer transition"
        >
          <div className="text-xs uppercase tracking-wider text-red-400 font-semibold flex items-center justify-between">
            <span>Out of Stock</span>
            <span>0</span>
          </div>
          <div className="text-2xl font-bold text-red-300 mt-2">{summary.outOfStockCount}</div>
          <div className="text-[11px] text-red-500/80 mt-0.5">Click to filter view</div>
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 bg-[#161616] p-1 rounded-lg border border-[#262626]">
          {(["ALL", "LOW", "OUT"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                filterTab === tab
                  ? "bg-[var(--color-primary-gold,#C9A24A)] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "ALL" ? "All Items" : tab === "LOW" ? "Low Stock (≤5)" : "Out of Stock (0)"}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Search inventory title, author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 bg-[#161616] border border-[#2A2A2A] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No inventory items matching current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Book Title</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Price</th>
                  <th className="py-3.5 px-4">Stock Level</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#161616]/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-xs text-gray-500">{item.author}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs text-gray-400 bg-[#1A1A1A] px-2 py-0.5 rounded border border-[#262626]">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[var(--color-primary-gold,#C9A24A)]">
                      {formatPrice(Number(item.price))}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                            item.stock === 0
                              ? "bg-red-950/70 text-red-300 border border-red-800"
                              : item.stock <= 5
                              ? "bg-amber-950/70 text-amber-300 border border-amber-800"
                              : "bg-emerald-950/70 text-emerald-300 border border-emerald-800"
                          }`}
                        >
                          {item.stock} units
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {item.stockStatus === "OUT_OF_STOCK" ? (
                        <span className="text-xs text-red-400 font-semibold">Out of Stock</span>
                      ) : item.stockStatus === "LOW_STOCK" ? (
                        <span className="text-xs text-amber-400 font-semibold">Reorder Soon</span>
                      ) : (
                        <span className="text-xs text-emerald-400 font-semibold">Healthy</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openHistoryDrawer(item)}
                          className="px-2.5 py-1 text-xs text-gray-400 hover:text-white rounded bg-[#181818] border border-[#282828] transition"
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => openAdjustModal(item)}
                          className="px-3 py-1 text-xs font-semibold text-black bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] rounded transition"
                        >
                          Adjust
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADJUST STOCK MODAL */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Stock Adjustment</h3>
            <p className="text-xs text-gray-400 mb-4">
              Book: <span className="text-white font-medium">{adjustingItem.title}</span>
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              {adjustError && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-800 text-red-200 rounded-lg">
                  {adjustError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Adjustment Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["INCREASE", "DECREASE", "SET"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAdjustType(t)}
                      className={`py-2 text-xs font-bold rounded-lg border transition ${
                        adjustType === t
                          ? "bg-[var(--color-primary-gold,#C9A24A)] text-black border-[var(--color-primary-gold,#C9A24A)]"
                          : "bg-[#1A1A1A] text-gray-400 border-[#2E2E2E] hover:text-white"
                      }`}
                    >
                      {t === "INCREASE" ? "+ Add" : t === "DECREASE" ? "- Remove" : "= Set Exact"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  {adjustType === "SET" ? "New Exact Stock" : "Quantity to Adjust"}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                />
              </div>

              {/* Projected Stock Preview */}
              <div className="p-3 bg-[#181818] rounded-lg border border-[#282828] flex items-center justify-between text-xs">
                <span className="text-gray-400">Current Stock: <strong className="text-white">{adjustingItem.stock}</strong></span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-400">New Projected Stock: <strong className="text-[var(--color-primary-gold,#C9A24A)] text-sm">{projectedStock}</strong></span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Audit Reason *
                </label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                >
                  <option value="Restock shipment received from supplier">Restock shipment received from supplier</option>
                  <option value="Damaged or defective stock written off">Damaged or defective stock written off</option>
                  <option value="Physical audit inventory reconciliation">Physical audit inventory reconciliation</option>
                  <option value="Customer order return or cancellation">Customer order return or cancellation</option>
                  <option value="Manual administrative correction">Manual administrative correction</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-black bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? "Updating..." : "Commit Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUSTMENT HISTORY DRAWER */}
      {historyItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-lg p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#262626]">
              <div>
                <h3 className="text-base font-bold text-white">Stock Adjustment History</h3>
                <p className="text-xs text-gray-400 mt-0.5">{historyItem.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryItem(null)}
                className="text-gray-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-2 overflow-y-auto flex-1 space-y-2 mt-3">
              {isLoadingHistory ? (
                <div className="p-8 text-center text-xs text-gray-400">Loading history...</div>
              ) : historyLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  No adjustments recorded for this title yet.
                </div>
              ) : (
                historyLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-[#161616] rounded-lg border border-[#262626] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        {log.adjustment_type === "INCREASE"
                          ? `+${log.quantity_change} Units Added`
                          : log.adjustment_type === "DECREASE"
                          ? `${log.quantity_change} Units Removed`
                          : `Stock Set to ${log.new_stock}`}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {log.previous_stock} → {log.new_stock}
                      </span>
                    </div>
                    <div className="text-gray-300">{log.reason}</div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1">
                      <span>By: {log.adminEmail}</span>
                      <span>{new Date(log.created_at).toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#262626] flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryItem(null)}
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

