"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import type { Database } from "@/types/database.types";

export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];

export interface RecordAuditLogParams {
  action: string;
  modelName: string;
  modelId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changes?: Record<string, any>;
}

/**
 * Records an administrative mutation event into public.audit_logs.
 */
export async function recordAdminAuditLog(params: RecordAuditLogParams): Promise<boolean> {
  try {
    const { user } = await requireAdmin();
    const supabase = await createClient();

    const { error } = await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: params.action,
      model_name: params.modelName,
      model_id: params.modelId || null,
      old_values: params.oldValues || {},
      new_values: params.newValues || {},
      changes: params.changes || {},
    });

    if (error) {
      console.error("Failed to insert audit log:", error.message);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("Error recording admin audit log:", err?.message || err);
    return false;
  }
}

/**
 * Retrieves paginated audit logs for admin inspection.
 */
export async function getAdminAuditLogs(params?: {
  action?: string;
  modelName?: string;
  page?: number;
  limit?: number;
}): Promise<{
  logs: Array<
    AuditLogRow & {
      adminEmail?: string;
      adminName?: string;
    }
  >;
  total: number;
  page: number;
  totalPages: number;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 25));
  const offset = (page - 1) * limit;

  let query = supabase.from("audit_logs").select("*", { count: "exact" });

  if (params?.action && params.action !== "ALL") {
    query = query.eq("action", params.action);
  }

  if (params?.modelName && params.modelName !== "ALL") {
    query = query.eq("model_name", params.modelName);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: rawLogs, error, count } = await query;

  if (error) {
    console.error("Error loading audit logs:", error.message);
    throw new Error(`Failed to load audit logs: ${error.message}`);
  }

  const logs = rawLogs || [];
  const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];

  let profileMap: Record<string, { email: string; name: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, { email: p.email || "", name: p.name || "" }])
      );
    }
  }

  const enrichedLogs = logs.map((log) => ({
    ...log,
    adminEmail: log.user_id ? profileMap[log.user_id]?.email : undefined,
    adminName: log.user_id ? profileMap[log.user_id]?.name : undefined,
  }));

  const total = count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    logs: enrichedLogs,
    total,
    page,
    totalPages,
  };
}

