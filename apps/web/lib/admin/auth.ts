import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface AdminContext {
  user: User;
  profile: ProfileRow;
}

/**
 * Checks whether the currently logged-in user is an authorized active admin.
 * Returns the admin context or null if unauthenticated or not an admin.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return null;
  }

  if (profile.role !== "admin" || profile.is_blocked || profile.is_deleted) {
    return null;
  }

  return { user, profile };
}

/**
 * Server-side guard for Admin Server Components and Server Actions.
 * Redirects unauthenticated users to /login and unauthorized non-admins to /?error=forbidden.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?redirect=/admin");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    redirect("/login?redirect=/admin");
  }

  if (profile.role !== "admin" || profile.is_blocked || profile.is_deleted) {
    redirect("/?error=forbidden");
  }

  return { user, profile };
}

/**
 * Guard for Admin API Route Handlers.
 * Returns either an error response (401/403) or the authorized admin context.
 */
export async function verifyAdminApi(): Promise<
  | { authorized: true; user: User; profile: ProfileRow }
  | { authorized: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized: Please log in." }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized: Profile not found." }, { status: 401 }),
    };
  }

  if (profile.role !== "admin" || profile.is_blocked || profile.is_deleted) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Forbidden: Administrative privileges required." },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, user, profile };
}

