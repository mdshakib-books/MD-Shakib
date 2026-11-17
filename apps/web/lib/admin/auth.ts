import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

import {
  isStaffRole,
  hasPermission,
  hasAnyPermission,
  type StaffPermission,
} from "./permissions";

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
 * Server-side guard enforcing at least one of the listed granular permissions (redirects on failure).
 */
export async function requireAnyStaffPermission(
  permissions: readonly StaffPermission[]
): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!hasAnyPermission(ctx.profile.role, permissions)) {
    redirect("/admin?error=unauthorized_permission");
  }
  return ctx;
}

/**
 * Non-redirecting permission check for Server Actions that return structured `{ success, error }` payloads.
 */
export async function verifyStaffActionPermission(
  permission?: StaffPermission | readonly StaffPermission[]
): Promise<
  | { authorized: true; user: User; profile: ProfileRow }
  | { authorized: false; error: string; status: 401 | 403 }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { authorized: false, error: "Unauthorized: Please log in.", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { authorized: false, error: "Unauthorized: Profile not found.", status: 401 };
  }

  if (!isStaffRole(profile.role) || profile.is_blocked || profile.is_deleted) {
    return {
      authorized: false,
      error: "Forbidden: Active staff privileges required.",
      status: 403,
    };
  }

  if (permission) {
    const allowed = Array.isArray(permission)
      ? hasAnyPermission(profile.role, permission)
      : hasPermission(profile.role, permission as StaffPermission);

    if (!allowed) {
      return {
        authorized: false,
        error: `Forbidden: Missing required permission (${Array.isArray(permission) ? permission.join(" or ") : permission}) for role "${profile.role}".`,
        status: 403,
      };
    }
  }

  return { authorized: true, user, profile };
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
 * Enforces authentication, active non-blocked/non-deleted staff status, and optional granular permission(s).
 */
export async function verifyAdminApi(
  requiredPermission?: StaffPermission | readonly StaffPermission[]
): Promise<
  | { authorized: true; user: User; profile: ProfileRow }
  | { authorized: false; response: NextResponse }
> {
  const check = await verifyStaffActionPermission(requiredPermission);
  if (!check.authorized) {
    return {
      authorized: false,
      response: NextResponse.json({ error: check.error }, { status: check.status }),
    };
  }
  return { authorized: true, user: check.user, profile: check.profile };
}

