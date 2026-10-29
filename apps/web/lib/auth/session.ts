import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Validates a redirect target URL to prevent open redirect vulnerabilities.
 * Only accepts relative same-origin paths starting with a single '/' and not '//'.
 */
export function sanitizeRedirectUrl(url: string | null | undefined, fallback: string = "/profile"): string {
  if (!url || typeof url !== "string") {
    return fallback;
  }

  const trimmed = url.trim();

  // Must begin with a single slash, followed by an alphanumeric character or another allowed path char
  // Disallows protocol-relative URLs (e.g., //evil.com) and backslashes
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }

  // Prevent control characters or javascript: URI schemes
  if (/[\u0000-\u001F\u007F]/.test(trimmed) || trimmed.toLowerCase().includes("javascript:")) {
    return fallback;
  }

  return trimmed;
}

/**
 * Retrieves the currently authenticated Supabase user on the server.
 * Never trusts client headers; verifies identity with Supabase Auth.
 */
export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Retrieves the customer's profile row from public.profiles.
 */
export async function getCustomerProfile(): Promise<ProfileRow | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error fetching customer profile:", error.message);
    return null;
  }

  return data;
}

