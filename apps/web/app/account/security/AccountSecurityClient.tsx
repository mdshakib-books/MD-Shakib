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

        {/* Feature 2.26: Phone Verification Card */}
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 md:p-8 shadow-luxury">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 mb-2">
            Phone Verification
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            Verify your mobile number to receive instant SMS delivery updates and courier dispatch notifications.
          </p>

          <PhoneVerificationSection initialPhone={profile.phone || ""} />
        </div>

        {/* Feature 2.25: Account Deletion / PII Anonymization Card */}
        <div className="bg-dark-surface border border-red-900/40 rounded-xl p-6 md:p-8 shadow-luxury">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">
            Delete &amp; Anonymize Account
          </h2>
          <p className="text-xs text-neutral-400 mb-4">
            Permanently remove your personal details, saved addresses, and active wishlist. In accordance with statutory financial regulations, completed order records and tax invoices will be retained in an anonymized format.
          </p>

          <AccountDeletionSection />
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

function PhoneVerificationSection({ initialPhone }: { initialPhone: string }) {
  const [phone, setPhone] = useState(initialPhone);
  const [step, setStep] = useState<"input" | "otp">("input");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isVerified, setIsVerified] = useState(Boolean(initialPhone));

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Failed to send OTP." });
        return;
      }
      setStep("otp");
      setMsg({ type: "success", text: "6-digit OTP dispatched to your mobile number." });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Invalid OTP code." });
        return;
      }
      setIsVerified(true);
      setStep("input");
      setMsg({ type: "success", text: "Phone number successfully verified and linked to your profile." });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Network error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md">
      {msg && (
        <div
          className={`p-3 rounded-lg text-xs mb-4 ${
            msg.type === "success"
              ? "bg-emerald-950/20 border border-emerald-500/30 text-emerald-400"
              : "bg-red-950/20 border border-red-500/30 text-red-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {step === "input" ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Mobile Phone Number</label>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="10-digit mobile (e.g. 9876543210)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A24A]"
              />
              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="px-4 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] disabled:opacity-50"
              >
                {loading ? "Sending..." : isVerified ? "Update Phone" : "Send OTP"}
              </button>
            </div>
          </div>
          {isVerified && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Verified Mobile Number</span>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Enter 6-Digit OTP sent to {phone}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="flex-1 bg-[#1C1C1C] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-white font-mono tracking-widest text-center focus:outline-none focus:border-[#C9A24A]"
              />
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="px-4 py-2 bg-[#C9A24A] text-black font-semibold text-xs rounded-lg hover:bg-[#E5C87B] disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify Code"}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep("input")}
            className="text-xs text-neutral-400 hover:text-white underline"
          >
            Change Phone Number
          </button>
        </form>
      )}
    </div>
  );
}

function AccountDeletionSection() {
  const [confirmInput, setConfirmInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmInput !== "DELETE MY ACCOUNT") return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/anonymize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete account.");
        return;
      }
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md">
      {error && (
        <div className="p-3 mb-4 rounded bg-red-950/40 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleDelete} className="space-y-3">
        <label className="block text-xs text-neutral-400">
          Type <strong className="text-red-400 font-mono">DELETE MY ACCOUNT</strong> to confirm:
        </label>
        <input
          type="text"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          placeholder="DELETE MY ACCOUNT"
          className="w-full bg-[#1C1C1C] border border-red-900/50 rounded-lg px-3 py-2 text-xs text-red-200 placeholder-neutral-600 focus:outline-none focus:border-red-500"
        />
        <button
          type="submit"
          disabled={loading || confirmInput !== "DELETE MY ACCOUNT"}
          className="px-4 py-2 bg-red-800 text-white font-semibold text-xs rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Anonymizing..." : "Permanently Delete & Anonymize"}
        </button>
      </form>
    </div>
  );
}
