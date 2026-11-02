"use client";

import * as React from "react";
import { useState, useActionState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
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

        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowLogoutModal(true)}
        >
          Sign Out
        </Button>
      </div>

      <AccountNav />

      <div className="space-y-8">
        {/* Account Details & Status Card */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 shadow-luxury">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-4 pb-2 border-b border-dark-border">
            Active Identity &amp; Status
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
              <Badge variant="success">Active &amp; Verified</Badge>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 md:p-8 shadow-luxury">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
            Change Password
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            To change your password, verify your current password and choose a secure new password (at least 6 characters).
          </p>

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
                className="absolute right-3 top-8 text-neutral-400 hover:text-white text-xs cursor-pointer select-none"
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
                className="absolute right-3 top-8 text-neutral-400 hover:text-white text-xs cursor-pointer select-none"
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
              <Button type="submit" variant="primary" size="md" disabled={isPending}>
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
