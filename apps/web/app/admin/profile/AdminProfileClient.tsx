"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerProfile, changeCustomerPassword } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { ConfirmModal } from "@/components/ui/Modal";
import type { ProfileRow } from "@/lib/admin/auth";

interface AdminProfileClientProps {
  initialProfile: ProfileRow;
}

export function AdminProfileClient({ initialProfile }: AdminProfileClientProps) {
  const router = useRouter();

  // Profile Form state
  const [name, setName] = useState(initialProfile.name || "");
  const [phone, setPhone] = useState(initialProfile.phone || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password Form state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Logout modal state
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone);

    try {
      const res = await updateCustomerProfile(null, formData);
      if (res.success) {
        setProfileMsg({ type: "success", text: res.message || "Profile updated successfully." });
        router.refresh();
      } else {
        setProfileMsg({ type: "error", text: res.error || "Failed to update profile." });
      }
    } catch (err: any) {
      setProfileMsg({ type: "error", text: err?.message || "Failed to update profile." });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match." });
      return;
    }

    setPasswordSaving(true);
    const formData = new FormData();
    formData.append("currentPassword", currentPassword);
    formData.append("newPassword", newPassword);
    formData.append("confirmPassword", confirmPassword);

    try {
      const res = await changeCustomerPassword(null, formData);
      if (res.success) {
        setPasswordMsg({ type: "success", text: res.message || "Password updated successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordSection(false);
      } else {
        setPasswordMsg({ type: "error", text: res.error || "Failed to change password." });
      }
    } catch (err: any) {
      setPasswordMsg({ type: "error", text: err?.message || "Failed to change password." });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    setShowLogoutModal(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-white">
            Administrator Profile &amp; Settings
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage your administrator credentials, personal contact information, and account security.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLogoutModal(true)}
          className="px-4 py-2 rounded-lg bg-red-950/40 border border-red-800/40 text-red-300 hover:bg-red-900/60 transition text-sm font-medium self-start sm:self-auto cursor-pointer"
        >
          Sign Out of Portal
        </button>
      </div>

      {/* Identity Card */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="w-20 h-20 rounded-full bg-[#1A1A1A] border-2 border-[var(--color-primary-gold)] flex items-center justify-center text-[var(--color-primary-gold)] text-2xl font-bold font-serif shrink-0 shadow-[0_0_20px_rgba(201,162,74,0.2)]">
          {(initialProfile.name || initialProfile.email || "A").charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-xl font-bold text-white font-serif">
              {initialProfile.name || "Administrator"}
            </h2>
            <span className="inline-block px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--color-primary-gold)]/10 text-[var(--color-primary-gold)] border border-[var(--color-primary-gold)]/30 self-center sm:self-auto">
              Administrator
            </span>
          </div>

          <p className="text-sm text-gray-400 font-mono">
            {initialProfile.email}
          </p>

          <p className="text-xs text-gray-500">
            Account ID: <span className="font-mono text-gray-400">{initialProfile.id}</span>
          </p>
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-gold)]">
          Contact Information
        </h3>

        {profileMsg && (
          <div
            className={`p-4 rounded-xl text-sm ${
              profileMsg.type === "success"
                ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-300"
                : "bg-red-950/40 border border-red-800/40 text-red-300"
            }`}
          >
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Email Address (Login ID)
            </label>
            <input
              type="email"
              disabled
              value={initialProfile.email}
              className="w-full bg-[#0E0E0E] border border-[#222] rounded-lg px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Email address cannot be changed directly from the portal.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-6 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-sm hover:opacity-95 transition disabled:opacity-50 cursor-pointer shadow-md"
            >
              {profileSaving ? "Saving Changes..." : "Save Profile"}
            </button>
          </div>
        </form>
      </div>

      {/* Security & Password */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-gold)]">
              Authentication Security
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Update password and credentials for this administrator account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswordSection(!showPasswordSection)}
            className="text-xs text-[var(--color-primary-gold)] hover:underline font-semibold cursor-pointer"
          >
            {showPasswordSection ? "Cancel" : "Change Password"}
          </button>
        </div>

        {passwordMsg && (
          <div
            className={`p-4 rounded-xl text-sm ${
              passwordMsg.type === "success"
                ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-300"
                : "bg-red-950/40 border border-red-800/40 text-red-300"
            }`}
          >
            {passwordMsg.text}
          </div>
        )}

        {showPasswordSection && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-2 border-t border-[#2A2A2A]">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  New Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordSaving}
                className="px-6 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-sm hover:opacity-95 transition disabled:opacity-50 cursor-pointer shadow-md"
              >
                {passwordSaving ? "Updating Password..." : "Update Password"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Sign Out of Admin Portal"
        description="Are you sure you want to end your administrator session?"
        confirmText="Sign Out"
        isDestructive
      />
    </div>
  );
}

