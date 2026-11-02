"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
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
            className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] font-semibold"
          >
            Saved Addresses &rarr;
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logoutCustomer()}
          >
            Sign Out
          </Button>
        </div>
      </div>

      <AccountNav />

      <div className="bg-dark-surface border border-dark-border rounded-xl p-6 md:p-8 shadow-luxury">
        {state?.error && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{state.error}</span>
          </div>
        )}

        {state?.success && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-emerald-400 text-xs font-medium flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{state.message}</span>
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
