import React from "react";
import { requireStaffPermission } from "@/lib/admin/auth";
import { getAdminCategories } from "@/lib/admin/categories";
import { AdminAddBookClient } from "./AdminAddBookClient";

export const dynamic = "force-dynamic";

export default async function AdminAddBookPage() {
  await requireStaffPermission("books.manage");
  const categories = await getAdminCategories();

  return <AdminAddBookClient categories={categories} />;
}

