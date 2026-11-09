import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

import { isStaffRole, hasPermission, type StaffPermission } from "./permissions";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface AdminContext {
  user: User;
  profile: ProfileRow;
}

/**
 * Checks whether the currently logged-in user is an authorized active admin or staff member.
 * Returns the admin context or null if unauthenticated or not staff.
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

  if (!isStaffRole(profile.role) || profile.is_blocked || profile.is_deleted) {
    return null;
  }

  return { user, profile };
}

/**
 * Server-side guard for Admin Server Components and Server Actions.
 * Redirects unauthenticated users to /login and unauthorized non-staff to /?error=forbidden.
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

  if (!isStaffRole(profile.role) || profile.is_blocked || profile.is_deleted) {
    redirect("/?error=forbidden");
  }

  return { user, profile };
}

/**
 * Server-side guard enforcing granular least-privilege staff permissions.
 */
export async function requireStaffPermission(permission: StaffPermission): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!hasPermission(ctx.profile.role, permission)) {
    redirect("/admin?error=unauthorized_permission");
  }
  return ctx;
}

/**
 * Server-side guard requiring Super Admin authority.
 */
export async function requireSuperAdmin(): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (ctx.profile.role !== "super_admin") {
    redirect("/admin?error=super_admin_required");
  }
  return ctx;
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

  if (!isStaffRole(profile.role) || profile.is_blocked || profile.is_deleted) {
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

