"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateCustomerProfile, logoutCustomer, type AuthActionResult } from "@/lib/auth/actions";
import type { ProfileRow } from "@/lib/auth/session";

interface ProfileClientProps {
  initialProfile: ProfileRow;
}

export function ProfileClient({ initialProfile }: ProfileClientProps) {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    updateCustomerProfile,
    null
  );

  return (
    <PageContainer size="md">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            My Profile
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your personal contact details and saved addresses.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <Link
            href="/addresses"
            className="text-xs uppercase tracking-wider text-[#C9A24A] hover:underline font-semibold"
          >
            Saved Addresses →
          </Link>
          <button
            onClick={() => logoutCustomer()}
            className="px-3 py-1.5 rounded-md border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 text-xs transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 md:p-8 shadow-xl">
        {state?.error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
            {state.error}
          </div>
        )}

        {state?.success && (
          <div className="mb-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            ✓ {state.message}
          </div>
        )}

        <form action={formAction} className="space-y-6 max-w-lg">
          <Input
            label="Full Name"
            id="name"
            name="name"
            defaultValue={initialProfile.name}
            required
          />

          <Input
            label="Email Address (Login ID)"
            id="email"
            type="email"
            defaultValue={initialProfile.email}
            disabled
          />

          <Input
            label="Mobile Phone"
            id="phone"
            name="phone"
            defaultValue={initialProfile.phone || ""}
            placeholder="+91 98765 43210"
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isPending}
            >
              {isPending ? "Updating..." : "Update Profile"}
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}

