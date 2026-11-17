import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { getServerSupabaseConfig } from "./config";

/**
 * Creates a type-safe Supabase client for Server Components, Server Actions,
 * and Route Handlers with secure cookie session management.
 * Use this when user session or authentication state is relevant.
 */
export async function createClient() {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    cookieStore = await cookies();
  } catch {
    // Graceful fallback when invoked outside of an HTTP request context (e.g. test scripts, seeders)
    cookieStore = null;
  }

  const { supabaseUrl, supabaseAnonKey } = getServerSupabaseConfig();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore ? cookieStore.getAll() : [];
      },
      setAll(cookiesToSet) {
        if (!cookieStore) return;
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

/**
 * Creates a stateless Supabase client for public catalog reads without invoking
 * dynamic cookie stores. This allows ISR / Static optimization for public pages.
 */
export function createPublicClient() {
  const { supabaseUrl, supabaseAnonKey } = getServerSupabaseConfig();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // No-op for public reads
      },
    },
  });
}
