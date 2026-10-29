import React from "react";
import { notFound } from "next/navigation";
import { getAdminOrderById } from "@/lib/admin/orders";
import { AdminOrderDetailClient } from "./AdminOrderDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getAdminOrderById(id);

  if (!order) {
    notFound();
  }

  return <AdminOrderDetailClient order={order} />;
}

