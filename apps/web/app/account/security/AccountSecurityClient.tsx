"use client";

import * as React from "react";
import { useState, useActionState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/ui/Modal";
import { changeCustomerPassword, logoutCustomer, type AuthActionResult } from "@/lib/auth/actions";
import type { ProfileRow } from "@/lib/auth/session";

interface AccountSecurityClientProps {
  profile: ProfileRow;
}

export function AccountSecurityClient({ profile }: AccountSecurityClientProps) {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    changeCustomerPassword,
    null
  );

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  return (
    <PageContainer size="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Account Security
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your login credentials, session, and authentication protection.
          </p>
        </div>

        <button
          onClick={() => setShowLogoutModal(true)}
          className="px-3.5 py-1.5 rounded-lg border border-red-900/60 bg-red-950/20 text-red-400 hover:bg-red-950/40 text-xs font-semibold transition cursor-pointer"
        >
          Sign Out
        </button>
      </div>

      <AccountNav />

      <div className="space-y-8">
        {/* Account Details & Status Card */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-4 pb-2 border-b border-[#222]">
            Active Identity & Status
          </h2>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Registered Email</span>
              <span className="text-neutral-200 font-mono text-sm">{profile.email}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Account ID</span>
              <span className="text-neutral-300 font-mono">{profile.id}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Security Role</span>
              <span className="text-neutral-300 uppercase font-mono">{profile.role || "Customer"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase">Account Standing</span>
              <span className="text-emerald-400 font-semibold">Active & Verified</span>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 md:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
            Change Password
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            To change your password, verify your current password and choose a secure new password (at least 6 characters).
          </p>

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

          <form action={formAction} className="space-y-5 max-w-md">
            <div className="relative">
              <Input
                label="Current Password"
                id="currentPassword"
                name="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-8 text-neutral-400 hover:text-white text-xs cursor-pointer"
              >
                {showCurrentPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div className="relative">
              <Input
                label="New Password"
                id="newPassword"
                name="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-8 text-neutral-400 hover:text-white text-xs cursor-pointer"
              >
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>

            <Input
              label="Confirm New Password"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? "Updating Password..." : "Change Password"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={async () => {
          setShowLogoutModal(false);
          await logoutCustomer();
        }}
        title="Confirm Sign Out"
        description="Are you sure you want to end your active session?"
        confirmText="Sign Out"
        isDestructive
      />
    </PageContainer>
  );
}

