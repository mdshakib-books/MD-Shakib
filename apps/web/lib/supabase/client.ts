import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { assertValidPublicSupabaseEnv } from "@/lib/env/public";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Creates a type-safe Supabase client for client-side React components.
 * Returns a singleton instance in the browser to avoid redundant connections and refresh loops.
 * Validates public Supabase environment configuration and blocks service-role key exposure.
 */
export function createClient() {
  if (typeof window !== "undefined" && client) {
    return client;
  }

  const { supabaseUrl, supabaseAnonKey } = assertValidPublicSupabaseEnv();

  const newClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

  if (typeof window !== "undefined") {
    client = newClient;
  }

  return newClient;
}
