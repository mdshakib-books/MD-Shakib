import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminProfileClient } from "./AdminProfileClient";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const { profile } = await requireAdmin();

  return <AdminProfileClient initialProfile={profile} />;
}

