import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const OTP_SECRET = process.env.DELIVERY_OTP_HMAC_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_phone_otp_secret_key";
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashPhoneOtp(phone: string, otp: string): string {
  return crypto.createHmac("sha256", OTP_SECRET).update(`${phone}:${otp}`).digest("hex");
}

function normalizePhone(rawPhone: string): string {
  // Strip non-digits
  const cleaned = rawPhone.replace(/\D/g, "");
  // If 10 digits (standard Indian mobile), keep 10 digits
  if (cleaned.length === 10) {
    return cleaned;
  }
  // If 12 digits starting with 91, extract last 10
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return cleaned.slice(2);
  }
  // Otherwise return cleaned
  return cleaned;
}

/**
 * Initiates phone verification by generating and securely hashing a 6-digit OTP (2.26).
 */
export async function sendPhoneVerificationOtp(
  userId: string,
  rawPhone: string
): Promise<{
  success: boolean;
  phone?: string;
  expiresAt?: string;
  mockOtpForTesting?: string;
  error?: string;
}> {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) {
    return { success: false, error: "Please enter a valid 10-digit mobile number." };
  }

  const adminDb = createAdminClient();

  // Rate limiting: check recent active OTP within 60 seconds
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data: recentOtp } = await adminDb
    .from("phone_verifications")
    .select("created_at")
    .eq("user_id", userId)
    .gt("created_at", oneMinuteAgo)
    .maybeSingle();

  if (recentOtp) {
    return { success: false, error: "Please wait at least 60 seconds before requesting a new OTP." };
  }

  // Generate CSPRNG 6-digit OTP
  const randomBytes = crypto.randomBytes(4);
  const otpNumber = (randomBytes.readUInt32BE(0) % 900000) + 100000;
  const otpString = otpNumber.toString();

  const otpHash = hashPhoneOtp(phone, otpString);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate any existing unverified OTPs for this user
  await adminDb
    .from("phone_verifications")
    .delete()
    .eq("user_id", userId)
    .eq("is_verified", false);

  const { error: insErr } = await adminDb.from("phone_verifications").insert({
    user_id: userId,
    phone,
    otp_hash: otpHash,
    attempts: 0,
    max_attempts: MAX_ATTEMPTS,
    expires_at: expiresAt,
    is_verified: false,
  });

  if (insErr) {
    return { success: false, error: insErr.message || "Failed to record phone verification request." };
  }

  // In non-production or test environment, surface OTP for automated test verification
  const isTestOrDev = process.env.NODE_ENV !== "production";

  return {
    success: true,
    phone,
    expiresAt,
    mockOtpForTesting: isTestOrDev ? otpString : undefined,
  };
}

/**
 * Validates the entered phone OTP and links the verified phone to customer profile (2.26).
 */
export async function verifyPhoneVerificationOtp(
  userId: string,
  rawPhone: string,
  enteredOtp: string
): Promise<{
  success: boolean;
  phone?: string;
  error?: string;
}> {
  const phone = normalizePhone(rawPhone);
  const trimmedOtp = enteredOtp.trim();

  if (!/^\d{6}$/.test(trimmedOtp)) {
    return { success: false, error: "OTP must be a 6-digit number." };
  }

  const adminDb = createAdminClient();

  const { data: record, error: recErr } = await adminDb
    .from("phone_verifications")
    .select("*")
    .eq("user_id", userId)
    .eq("phone", phone)
    .eq("is_verified", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recErr || !record) {
    return { success: false, error: "No active verification request found for this phone number." };
  }

  // Check expiration
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { success: false, error: "The verification code has expired. Please request a new one." };
  }

  // Check max attempts
  if (record.attempts >= record.max_attempts) {
    return { success: false, error: "Maximum verification attempts exceeded. Please request a new OTP." };
  }

  // Verify hash
  const computedHash = hashPhoneOtp(phone, trimmedOtp);
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(computedHash, "hex"),
    Buffer.from(record.otp_hash, "hex")
  );

  if (!isMatch) {
    // Increment attempts
    await adminDb
      .from("phone_verifications")
      .update({ attempts: record.attempts + 1 })
      .eq("id", record.id);

    const remaining = record.max_attempts - (record.attempts + 1);
    return {
      success: false,
      error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : "Maximum attempts reached."}`,
    };
  }

  // Success: mark verified and update profile
  const nowIso = new Date().toISOString();

  await adminDb
    .from("phone_verifications")
    .update({
      is_verified: true,
      verified_at: nowIso,
    })
    .eq("id", record.id);

  // Update profile phone
  await adminDb
    .from("profiles")
    .update({
      phone,
      updated_at: nowIso,
    })
    .eq("id", userId);

  return {
    success: true,
    phone,
  };
}
