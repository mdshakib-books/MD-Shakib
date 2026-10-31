"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirectUrl, getAuthenticatedUser, getCanonicalSiteUrl } from "./session";
import type { Database } from "@/types/database.types";

export interface AuthActionResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Registers a new customer with Supabase Auth.
 */
export async function signUpCustomer(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!name || name.length < 2) {
    return { success: false, error: "Please enter your full name (at least 2 characters)." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Please provide a valid email address." };
  }

  if (!password || password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        full_name: name,
      },
    },
  });

  if (error) {
    if (error.message.includes("already registered") || error.message.includes("User already exists")) {
      return { success: false, error: "An account with this email address already exists." };
    }
    return { success: false, error: error.message };
  }

  // If email confirmation is required and user not immediately confirmed
  if (data.user && !data.session) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  const redirectTarget = formData.get("redirect")?.toString();
  const destination = sanitizeRedirectUrl(redirectTarget, "/profile");
  redirect(destination);
}

/**
 * Authenticates an existing customer.
 */
export async function loginCustomer(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();
  const redirectTarget = formData.get("redirect")?.toString();
  const guestCartJson = formData.get("guestCart")?.toString();

  if (!email || !password) {
    return { success: false, error: "Please enter both your email address and password." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return { success: false, error: "Invalid email or password. Please try again." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { success: false, error: "Your email is not verified. Please check your inbox." };
    }
    return { success: false, error: error.message };
  }

  const destination = sanitizeRedirectUrl(redirectTarget, "/profile");
  redirect(destination);
}

/**
 * Terminates the active customer session.
 */
export async function logoutCustomer(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Sends a password reset email instructions.
 */
export async function sendPasswordReset(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Please enter a valid email address." };
  }

  const supabase = await createClient();

  // Always return success message to prevent user enumeration attacks
  const siteUrl = getCanonicalSiteUrl();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/reset-password`,
  });

  return {
    success: true,
    message: "If an account exists for this email, password reset instructions have been sent.",
  };
}

/**
 * Updates password during a password reset / recovery session.
 */
export async function updatePassword(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!password || password.length < 6) {
    return { success: false, error: "New password must be at least 6 characters long." };
  }

  if (password !== confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect("/login?message=password_updated");
}

/**
 * Verifies 6-digit OTP code.
 */
export async function verifyEmailOtp(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const token = formData.get("token")?.toString().trim();
  const type = (formData.get("type")?.toString() || "signup") as "signup" | "recovery" | "email";

  if (!email || !token) {
    return { success: false, error: "Please enter your email and the 6-digit verification code." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type,
  });

  if (error) {
    return { success: false, error: "Invalid or expired verification code. Please request a new one." };
  }

  if (type === "recovery") {
    redirect("/reset-password");
  }

  redirect("/profile");
}

/**
 * Updates customer profile details (name and phone only).
 */
export async function updateCustomerProfile(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: "Authentication required to update profile." };
  }

  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim() || null;

  if (!name || name.length < 1) {
    return { success: false, error: "Full name cannot be empty." };
  }

  const supabase = await createClient();

  const updatePayload: Database["public"]["Tables"]["profiles"]["Update"] = {
    name,
    phone,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

  if (error) {
    console.error("Profile update error:", error.message);
    return { success: false, error: "Failed to update profile. Please try again." };
  }

  return { success: true, message: "Profile successfully updated." };
}

/**
 * Changes an authenticated customer's password after verifying their current password.
 */
export async function changeCustomerPassword(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const user = await getAuthenticatedUser();
  if (!user || !user.email) {
    return { success: false, error: "Authentication required to change password." };
  }

  const currentPassword = formData.get("currentPassword")?.toString();
  const newPassword = formData.get("newPassword")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!currentPassword) {
    return { success: false, error: "Please enter your current password." };
  }

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters long." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "New passwords do not match." };
  }

  const supabase = await createClient();

  // 1. Verify current credentials by attempting authentication
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyErr) {
    return { success: false, error: "Current password is incorrect." };
  }

  // 2. Apply new password
  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true, message: "Your password has been changed successfully." };
}
