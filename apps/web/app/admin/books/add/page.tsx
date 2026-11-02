import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminCategories } from "@/lib/admin/categories";
import { AdminAddBookClient } from "./AdminAddBookClient";

export const dynamic = "force-dynamic";

export default async function AdminAddBookPage() {
  await requireAdmin();
  const categories = await getAdminCategories();

  return <AdminAddBookClient categories={categories} />;
}

