"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ConfirmModal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import {
  deleteAddress,
  setDefaultAddress,
  createAddress,
  updateAddress,
  type AddressRow,
} from "@/lib/commerce/addresses";

interface AddressesClientProps {
  initialAddresses: AddressRow[];
}

export function AddressesClient({ initialAddresses }: AddressesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const confirmDelete = () => {
    if (!deletingId) return;
    const id = deletingId;
    setDeletingId(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await deleteAddress(id);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("Address successfully deleted.");
        router.refresh();
      }
    });
  };

  const handleSetDefault = (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await setDefaultAddress(id);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("Default address updated.");
        router.refresh();
      }
    });
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAddress(null, formData);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setIsAdding(false);
        setSuccessMsg("Address added successfully.");
        router.refresh();
      }
    });
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingAddress) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateAddress(editingAddress.id, formData);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setEditingAddress(null);
        setSuccessMsg("Address updated successfully.");
        router.refresh();
      }
    });
  };

  return (
    <PageContainer size="md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[#C9A24A] uppercase font-bold tracking-wide">
            Saved Addresses
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-light">
            Manage your delivery destinations for quick and easy checkout.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingAddress(null);
          }}
          disabled={isPending}
        >
          {isAdding ? "Cancel" : "+ Add New Address"}
        </Button>
      </div>

      <AccountNav />

      {errorMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs"
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add Address Form Panel */}
      {isAdding && (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-6 mb-8 shadow-2xl animate-in fade-in duration-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200 mb-5 pb-3 border-b border-[#222222]">
            Add Delivery Address
          </h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Recipient Full Name" name="fullName" placeholder="Mohammad Shakib" required />
              <Input label="10-Digit Mobile Phone" name="phone" placeholder="9876543210" required />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="House / Flat / Building No." name="houseNo" placeholder="Flat 4B, Emerald Residency" required />
              <Input label="Street / Colony / Area" name="area" placeholder="Park Street" required />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Input label="City" name="city" placeholder="Kolkata" required />
              <Input label="State" name="state" placeholder="West Bengal" required />
              <Input label="6-Digit Pincode" name="pincode" placeholder="700016" maxLength={6} required />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Landmark (Optional)" name="landmark" placeholder="Near Jama Masjid" />
              <Select
                label="Address Type"
                name="addressType"
                defaultValue="Home"
                options={[
                  { label: "Home", value: "Home" },
                  { label: "Office", value: "Office" },
                  { label: "Other", value: "Other" },
                ]}
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#222222]">
              <label className="flex items-center space-x-2.5 text-xs text-neutral-300 cursor-pointer">
                <input type="checkbox" name="isDefault" className="accent-[#C9A24A] rounded w-4 h-4" />
                <span>Set as default shipping address</span>
              </label>

              <div className="flex space-x-2.5 justify-end">
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdding(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isPending}>
                  {isPending ? "Saving..." : "Save Address"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Edit Address Form Panel */}
      {editingAddress && (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-6 mb-8 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#222222]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
              Edit Delivery Address
            </h2>
            <button
              onClick={() => setEditingAddress(null)}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Close</span>
            </button>
          </div>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Recipient Full Name"
                name="fullName"
                defaultValue={editingAddress.full_name}
                required
              />
              <Input
                label="10-Digit Mobile Phone"
                name="phone"
                defaultValue={editingAddress.phone}
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="House / Flat / Building No."
                name="houseNo"
                defaultValue={editingAddress.house_no}
                required
              />
              <Input
                label="Street / Colony / Area"
                name="area"
                defaultValue={editingAddress.area}
                required
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <Input
                label="City"
                name="city"
                defaultValue={editingAddress.city}
                required
              />
              <Input
                label="State"
                name="state"
                defaultValue={editingAddress.state}
                required
              />
              <Input
                label="6-Digit Pincode"
                name="pincode"
                defaultValue={editingAddress.pincode}
                maxLength={6}
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="Landmark (Optional)"
                name="landmark"
                defaultValue={editingAddress.landmark || ""}
              />
              <Select
                label="Address Type"
                name="addressType"
                defaultValue={editingAddress.address_type}
                options={[
                  { label: "Home", value: "Home" },
                  { label: "Office", value: "Office" },
                  { label: "Other", value: "Other" },
                ]}
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[#222222]">
              <label className="flex items-center space-x-2.5 text-xs text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  name="isDefault"
                  defaultChecked={editingAddress.is_default}
                  className="accent-[#C9A24A] rounded w-4 h-4"
                />
                <span>Set as default shipping address</span>
              </label>

              <div className="flex space-x-2.5 justify-end">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditingAddress(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isPending}>
                  {isPending ? "Updating..." : "Update Address"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Address Cards Grid */}
      {initialAddresses.length === 0 ? (
        <div className="text-center py-16 bg-[#141414] border border-[#222222] rounded-2xl">
          <svg className="w-10 h-10 text-neutral-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-white font-serif text-base uppercase tracking-wide">No addresses saved</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto font-light">
            Save your shipping destination for faster one-click checkout on your next order.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {initialAddresses.map((addr) => (
            <div
              key={addr.id}
              className={`bg-[#141414] border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-luxury ${
                addr.is_default
                  ? "border-[#C9A24A] shadow-[#C9A24A]/5"
                  : "border-[#262626] hover:border-[#383838]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-neutral-100 text-sm">{addr.full_name}</span>
                    <Badge variant="muted" size="sm">
                      {addr.address_type}
                    </Badge>
                  </div>
                  {addr.is_default && (
                    <Badge variant="gold" size="sm">
                      Default
                    </Badge>
                  )}
                </div>

                <div className="text-xs text-neutral-400 space-y-1 font-light leading-relaxed mt-2">
                  <p>{addr.house_no}, {addr.area}</p>
                  {addr.landmark && <p className="text-neutral-500">Landmark: {addr.landmark}</p>}
                  <p>{addr.city}, {addr.state} - <span className="font-mono text-neutral-300 font-normal">{addr.pincode}</span></p>
                  <p className="pt-1 text-neutral-400">Phone: <span className="font-mono text-neutral-200">{addr.phone}</span></p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-[#222222] text-xs">
                {!addr.is_default ? (
                  <button
                    onClick={() => handleSetDefault(addr.id)}
                    disabled={isPending}
                    aria-label={`Set ${addr.full_name}'s address as default`}
                    className="text-neutral-400 hover:text-[#C9A24A] transition-colors cursor-pointer px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]"
                  >
                    Set as Default
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-primary-gold)] font-medium tracking-wide">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Default Address</span>
                  </span>
                )}

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      setEditingAddress(addr);
                      setIsAdding(false);
                    }}
                    disabled={isPending}
                    aria-label={`Edit address for ${addr.full_name}`}
                    className="text-neutral-300 hover:text-[#C9A24A] transition-colors cursor-pointer px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingId(addr.id)}
                    disabled={isPending}
                    aria-label={`Delete address for ${addr.full_name}`}
                    className="text-neutral-400 hover:text-red-400 transition-colors cursor-pointer px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingId)}
        onClose={() => setDeletingId(null)}
        onConfirm={confirmDelete}
        title="Delete Address"
        description="Are you sure you want to remove this saved delivery address? This action cannot be undone."
        confirmText="Delete Address"
        isDestructive
        isLoading={isPending}
      />
    </PageContainer>
  );
}
