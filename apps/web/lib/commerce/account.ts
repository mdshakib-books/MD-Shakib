"use server";

import { createClient } from "@/lib/supabase/server";
import { getCustomerProfile, type ProfileRow } from "@/lib/auth/session";
import type { Database } from "@/types/database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type AddressRow = Database["public"]["Tables"]["addresses"]["Row"];

export interface CustomerAccountOverview {
  profile: ProfileRow;
  totalOrders: number;
  activeOrders: number;
  savedAddressesCount: number;
  defaultAddress: AddressRow | null;
  recentOrders: OrderRow[];
  activeReplacementsCount: number;
}

/**
 * Retrieves an aggregated overview of the authenticated customer's account.
 */
export async function getCustomerAccountOverview(): Promise<CustomerAccountOverview | null> {
  const profile = await getCustomerProfile();
  if (!profile) return null;

  const supabase = await createClient();

  // 1. Orders summary & recent orders
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const allOrders = orders || [];
  const totalOrders = allOrders.length;
  const activeOrders = allOrders.filter((o) =>
    ["Pending", "Confirmed", "Processing", "Shipped", "Out for Delivery"].includes(o.order_status)
  ).length;
  const recentOrders = allOrders.slice(0, 3);
  const activeReplacementsCount = allOrders.filter(
    (o) => o.replacement_requested && !["Rejected", "Replacement Delivered"].includes(o.replacement_status)
  ).length;

  // 2. Addresses summary
  const { data: addresses } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", profile.id)
    .order("is_default", { ascending: false });

  const allAddresses = addresses || [];
  const savedAddressesCount = allAddresses.length;
  const defaultAddress = allAddresses.find((a) => a.is_default) || allAddresses[0] || null;

  return {
    profile,
    totalOrders,
    activeOrders,
    savedAddressesCount,
    defaultAddress,
    recentOrders,
    activeReplacementsCount,
  };
}

