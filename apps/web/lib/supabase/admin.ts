import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAdminSupabaseConfig } from "./config";

/**
 * Creates an administrative Supabase client using the SERVICE_ROLE_KEY.
 *
 * CRITICAL SECURITY NOTICE:
 * - This client BYPASSES Row Level Security (RLS).
 * - MUST ONLY be used on the server in trusted backend contexts:
 *   - Webhook processing (Razorpay, Delhivery)
 *   - System audit and email log insertions
 *   - Administrative background operations
 * - NEVER expose this client or SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "Security violation: createAdminClient() and SUPABASE_SERVICE_ROLE_KEY cannot be used in browser context."
    );
  }

  const { supabaseUrl, serviceRoleKey } = getAdminSupabaseConfig();

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
