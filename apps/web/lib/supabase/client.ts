import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Creates a type-safe Supabase client for client-side React components.
 * Returns a singleton instance in the browser to avoid redundant connections and refresh loops.
 */
export function createClient() {
  if (typeof window !== "undefined" && client) {
    return client;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const newClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

  if (typeof window !== "undefined") {
    client = newClient;
  }

  return newClient;
}

