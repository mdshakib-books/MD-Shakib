"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import {
  createAdminDiscount,
  updateAdminDiscount,
  toggleDiscountStatus,
  deleteAdminDiscount,
  type DiscountRow,
  type DiscountInput,
} from "@/lib/admin/discounts";

interface AdminDiscountsClientProps {
  initialDiscounts: DiscountRow[];
}

export function AdminDiscountsClient({ initialDiscounts }: AdminDiscountsClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountRow | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState(10);
  const [minOrderAmount, setMinOrderAmount] = useState(500);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState<number | "">(200);
  const [usageLimit, setUsageLimit] = useState<number | "">(100);
  const [validUntil, setValidUntil] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingDiscount(null);
    setCode("");
    setDiscountType("percentage");
    setDiscountValue(10);
    setMinOrderAmount(500);
    setMaxDiscountAmount(200);
    setUsageLimit(100);
    setValidUntil("");
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (d: DiscountRow) => {
    setEditingDiscount(d);
    setCode(d.code);
    setDiscountType(d.discount_type);
    setDiscountValue(Number(d.discount_value));
    setMinOrderAmount(Number(d.min_order_amount));
    setMaxDiscountAmount(d.max_discount_amount ? Number(d.max_discount_amount) : "");
    setUsageLimit(d.usage_limit ? Number(d.usage_limit) : "");
    setValidUntil(d.valid_until ? d.valid_until.slice(0, 10) : "");
    setIsActive(d.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload: DiscountInput = {
        code,
        discount_type: discountType,
        discount_value: Number(discountValue),
        min_order_amount: Number(minOrderAmount),
        max_discount_amount: maxDiscountAmount === "" ? null : Number(maxDiscountAmount),
        usage_limit: usageLimit === "" ? null : Number(usageLimit),
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        is_active: isActive,
      };

      if (editingDiscount) {
        const res = await updateAdminDiscount(editingDiscount.id, payload);
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createAdminDiscount(payload);
        if (!res.success) throw new Error(res.error);
      }

      setIsModalOpen(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save discount.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (d: DiscountRow) => {
    const res = await toggleDiscountStatus(d.id, !d.is_active);
    if (res.success) {
      router.refresh();
    } else {
      alert(`Error toggling discount: ${res.error}`);
    }
  };

  const handleDelete = async (id: string, codeStr: string) => {
    if (!confirm(`Are you sure you want to delete coupon code "${codeStr}"?`)) return;

    const res = await deleteAdminDiscount(id);
    if (res.success) {
      router.refresh();
    } else {
      alert(`Failed to delete coupon: ${res.error}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] text-black font-semibold rounded-lg text-sm transition flex items-center gap-2 shadow"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Coupon Code</span>
        </button>
      </div>

      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {initialDiscounts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No promotional discounts configured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Coupon Code</th>
                  <th className="py-3.5 px-4">Discount</th>
                  <th className="py-3.5 px-4">Min. Order</th>
                  <th className="py-3.5 px-4">Max. Cap</th>
                  <th className="py-3.5 px-4">Usage</th>
                  <th className="py-3.5 px-4">Validity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {initialDiscounts.map((d) => {
                  const isExpired = d.valid_until && new Date(d.valid_until) < new Date();

                  return (
                    <tr key={d.id} className="hover:bg-[#161616]/40 transition">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-white bg-[#1A1A1A] px-2.5 py-1 rounded border border-[#2E2E2E]">
                          {d.code}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-[var(--color-primary-gold,#C9A24A)]">
                        {d.discount_type === "percentage"
                          ? `${d.discount_value}% OFF`
                          : `${formatPrice(d.discount_value)} OFF`}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-300">
                        {d.min_order_amount > 0 ? formatPrice(d.min_order_amount) : "No minimum"}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-400">
                        {d.max_discount_amount ? formatPrice(d.max_discount_amount) : "Uncapped"}
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <span className="text-white font-medium">{d.used_count}</span>
                        {d.usage_limit ? (
                          <span className="text-gray-500"> / {d.usage_limit}</span>
                        ) : (
                          <span className="text-gray-500"> / ∞</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-gray-400">
                        {d.valid_until ? (
                          <span className={isExpired ? "text-red-400 font-medium" : ""}>
                            {new Date(d.valid_until).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            {isExpired && " (Expired)"}
                          </span>
                        ) : (
                          "Ongoing"
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggle(d)}
                          className="focus:outline-none"
                        >
                          <Badge variant={d.is_active && !isExpired ? "success" : "muted"}>
                            {isExpired ? "Expired" : d.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(d)}
                            className="px-2.5 py-1 text-xs font-medium text-gray-200 bg-[#1A1A1A] hover:bg-[#252525] border border-[#2E2E2E] rounded transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d.id, d.code)}
                            className="p-1.5 text-xs text-red-400 hover:text-red-200 rounded bg-[#1C1212] border border-red-950 hover:bg-red-950 transition"
                            title="Delete Coupon"
                          >
                            ✕
                          </button>
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

      {/* CREATE / EDIT COUPON MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              {editingDiscount ? "Edit Coupon Code" : "Create New Coupon"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-800 text-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs font-mono font-bold text-[var(--color-primary-gold,#C9A24A)] focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  placeholder="e.g. EID2026"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Discount Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Min. Order Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Max. Cap (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={maxDiscountAmount}
                    onChange={(e) => setMaxDiscountAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="Optional cap"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Total Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="Unlimited"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Expiration Date
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="couponActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-[#222222] border-[#333333]"
                />
                <label htmlFor="couponActive" className="text-xs text-gray-300 cursor-pointer">
                  Activate coupon immediately
                </label>
              </div>

              <div className="pt-3 border-t border-[#262626] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-black bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : editingDiscount ? "Update Coupon" : "Create Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

