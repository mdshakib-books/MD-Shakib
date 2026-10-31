"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import type { Database } from "@/types/database.types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface CustomerListItem extends ProfileRow {
  ordersCount: number;
  totalSpent: number;
}

export interface CustomerDetails extends ProfileRow {
  orders: Array<{
    id: string;
    totalAmount: number;
    orderStatus: string;
    paymentStatus: string;
    paymentMethod: string;
    createdAt: string;
  }>;
  addresses: Array<{
    id: string;
    fullName: string;
    phone: string;
    houseNo: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
    addressType: string;
    isDefault: boolean;
  }>;
  metrics: {
    totalOrders: number;
    totalSpent: number;
    paidOrders: number;
  };
}

/**
 * Retrieves paginated customer profiles with order counts and total expenditure metrics.
 */
export async function getAdminCustomers(params?: {
  search?: string;
  role?: string;
  status?: "all" | "active" | "blocked" | "deleted";
  page?: number;
  limit?: number;
}): Promise<{
  customers: CustomerListItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = (page - 1) * limit;

  let query = supabase.from("profiles").select("*", { count: "exact" });

  if (params?.search?.trim()) {
    const term = params.search.trim();
    query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  if (params?.role && params.role !== "ALL") {
    query = query.eq("role", params.role);
  }

  if (params?.status === "active") {
    query = query.eq("is_blocked", false).eq("is_deleted", false);
  } else if (params?.status === "blocked") {
    query = query.eq("is_blocked", true);
  } else if (params?.status === "deleted") {
    query = query.eq("is_deleted", true);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: profiles, error, count } = await query;

  if (error) {
    console.error("Error fetching admin customers:", error.message);
    throw new Error(`Failed to load customers: ${error.message}`);
  }

  const profileList = profiles || [];
  const profileIds = profileList.map((p) => p.id);

  // Fetch orders aggregate for these profiles
  let orderStatsMap: Record<string, { count: number; spent: number }> = {};

  if (profileIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("user_id, total_amount, payment_status")
      .in("user_id", profileIds);

    for (const ord of orders || []) {
      if (!orderStatsMap[ord.user_id]) {
        orderStatsMap[ord.user_id] = { count: 0, spent: 0 };
      }
      orderStatsMap[ord.user_id].count++;
      if (ord.payment_status === "Paid") {
        orderStatsMap[ord.user_id].spent += Number(ord.total_amount) || 0;
      }
    }
  }

  const customers: CustomerListItem[] = profileList.map((p) => ({
    ...p,
    ordersCount: orderStatsMap[p.id]?.count || 0,
    totalSpent: orderStatsMap[p.id]?.spent || 0,
  }));

  const total = count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    customers,
    total,
    page,
    totalPages,
  };
}

/**
 * Retrieves comprehensive customer information including order history and saved delivery addresses.
 */
export async function getAdminCustomerDetails(customerId: string): Promise<CustomerDetails | null> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", customerId)
    .single();

  if (profErr || !profile) {
    return null;
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, total_amount, order_status, payment_status, payment_method, created_at")
    .eq("user_id", customerId)
    .order("created_at", { ascending: false });

  const { data: addresses } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", customerId)
    .order("is_default", { ascending: false });

  const allOrders = orders || [];
  let totalSpent = 0;
  let paidOrders = 0;

  for (const ord of allOrders) {
    if (ord.payment_status === "Paid") {
      paidOrders++;
      totalSpent += Number(ord.total_amount) || 0;
    }
  }

  return {
    ...profile,
    orders: allOrders.map((o) => ({
      id: o.id,
      totalAmount: Number(o.total_amount) || 0,
      orderStatus: o.order_status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      createdAt: o.created_at,
    })),
    addresses: (addresses || []).map((a) => ({
      id: a.id,
      fullName: a.full_name,
      phone: a.phone,
      houseNo: a.house_no,
      area: a.area,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      addressType: a.address_type,
      isDefault: a.is_default,
    })),
    metrics: {
      totalOrders: allOrders.length,
      totalSpent,
      paidOrders,
    },
  };
}

/**
 * Updates a customer account status (BLOCK, UNBLOCK, SOFT_DELETE, RESTORE) via atomic RPC.
 * Disallows administrators from modifying their own accounts.
 */
export async function updateCustomerAccountStatus(payload: {
  customerId: string;
  action: "BLOCK" | "UNBLOCK" | "SOFT_DELETE" | "RESTORE";
}): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { customerId, action } = payload;

  if (customerId === user.id) {
    return {
      success: false,
      error: "Safety violation: You cannot block or delete your own active administrator account.",
    };
  }

  const { data, error } = await supabase.rpc("update_customer_status", {
    p_customer_id: customerId,
    p_admin_id: user.id,
    p_action: action,
  });

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "Failed to update customer account status.",
    };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");

  return { success: true };
}

