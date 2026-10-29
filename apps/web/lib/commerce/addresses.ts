"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Database } from "@/types/database.types";

export type AddressRow = Database["public"]["Tables"]["addresses"]["Row"];

export interface AddressActionResult {
  success: boolean;
  error?: string;
  message?: string;
  addressId?: string;
}

/**
 * Retrieves all delivery addresses for the authenticated customer.
 */
export async function getCustomerAddresses(): Promise<AddressRow[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching addresses:", error.message);
    return [];
  }

  return data || [];
}

/**
 * Creates a new delivery address for the customer.
 */
export async function createAddress(
  prevState: AddressActionResult | null,
  formData: FormData
): Promise<AddressActionResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Please log in to add an address." };

  const fullName = formData.get("fullName")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const houseNo = formData.get("houseNo")?.toString().trim();
  const area = formData.get("area")?.toString().trim();
  const city = formData.get("city")?.toString().trim();
  const state = formData.get("state")?.toString().trim();
  const pincode = formData.get("pincode")?.toString().trim();
  const landmark = formData.get("landmark")?.toString().trim() || null;
  const addressType = (formData.get("addressType")?.toString() || "Home") as "Home" | "Office" | "Other";
  const isDefault = formData.get("isDefault") === "on" || formData.get("isDefault") === "true";

  if (!fullName || !phone || !houseNo || !area || !city || !state || !pincode) {
    return { success: false, error: "Please fill in all required address fields." };
  }

  if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
    return { success: false, error: "Pincode must be exactly 6 digits." };
  }

  if (phone.length < 10) {
    return { success: false, error: "Please provide a valid 10-digit mobile number." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("addresses")
    .insert({
      user_id: user.id,
      full_name: fullName,
      phone,
      house_no: houseNo,
      area,
      city,
      state,
      pincode,
      landmark,
      address_type: addressType,
      is_default: isDefault,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error inserting address:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/addresses");
  revalidatePath("/checkout");
  return { success: true, message: "Address added successfully.", addressId: data.id };
}

/**
 * Deletes an address belonging to the customer.
 */
export async function deleteAddress(addressId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", addressId)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error deleting address:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/addresses");
  revalidatePath("/checkout");
  return { success: true };
}

/**
 * Sets an address as the default shipping address.
 */
export async function setDefaultAddress(addressId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();
  // trg_default_address automatically unsets default flag on other user addresses
  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error setting default address:", error.message);
    return { success: false, error: error.message };
  }

  revalidatePath("/addresses");
  revalidatePath("/checkout");
  return { success: true };
}

