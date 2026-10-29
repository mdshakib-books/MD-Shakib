"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { deleteAddress, setDefaultAddress, createAddress, type AddressRow } from "@/lib/commerce/addresses";

interface AddressesClientProps {
  initialAddresses: AddressRow[];
}

export function AddressesClient({ initialAddresses }: AddressesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this address?")) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteAddress(id);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleSetDefault = (id: string) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await setDefaultAddress(id);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createAddress(null, formData);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setIsAdding(false);
        router.refresh();
      }
    });
  };

  return (
    <PageContainer size="md">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Saved Addresses
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your delivery destinations for quick and easy checkout.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
          disabled={isPending}
        >
          {isAdding ? "Cancel" : "+ Add New Address"}
        </Button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Add Address Form Modal/Panel */}
      {isAdding && (
        <div className="bg-[#141414] border border-[#2E2E2E] rounded-xl p-6 mb-8 shadow-2xl">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-200 mb-4 pb-2 border-b border-[#2A2A2A]">
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

            <Input label="Landmark (Optional)" name="landmark" placeholder="Near Jama Masjid" />

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center space-x-2 text-xs text-neutral-300 cursor-pointer">
                <input type="checkbox" name="isDefault" className="accent-[var(--color-primary-gold)] rounded" />
                <span>Set as default shipping address</span>
              </label>

              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? "Saving..." : "Save Address"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Addresses List */}
      {initialAddresses.length === 0 && !isAdding ? (
        <div className="text-center py-16 px-4 bg-[#141414] border border-[#222] rounded-xl">
          <p className="text-neutral-400 font-serif text-lg">No saved addresses</p>
          <p className="text-xs text-neutral-500 mt-2 mb-4">
            You have not added any delivery addresses yet.
          </p>
          <Button variant="primary" size="sm" onClick={() => setIsAdding(true)}>
            Add Your First Address
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {initialAddresses.map((addr) => (
            <div
              key={addr.id}
              className={`bg-[#141414] border rounded-xl p-5 transition ${
                addr.is_default ? "border-[var(--color-primary-gold)]/60" : "border-[#262626]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-neutral-200 text-sm">{addr.full_name}</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#222] text-neutral-400">
                      {addr.address_type}
                    </span>
                    {addr.is_default && (
                      <span className="text-[10px] font-bold text-black bg-[var(--color-primary-gold)] px-2 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-2">
                    {addr.house_no}, {addr.area}
                    {addr.landmark ? `, Near ${addr.landmark}` : ""}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {addr.city}, {addr.state} - <span className="font-mono text-neutral-300">{addr.pincode}</span>
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">Phone: {addr.phone}</p>
                </div>

                <div className="flex items-center space-x-2">
                  {!addr.is_default && (
                    <button
                      onClick={() => handleSetDefault(addr.id)}
                      disabled={isPending}
                      className="text-xs text-[var(--color-primary-gold)] hover:underline cursor-pointer"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(addr.id)}
                    disabled={isPending}
                    className="text-xs text-neutral-500 hover:text-red-400 cursor-pointer ml-3"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

