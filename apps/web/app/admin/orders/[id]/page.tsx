import React from "react";
import { notFound } from "next/navigation";
import { requireStaffPermission } from "@/lib/admin/auth";
import { getAdminOrderById } from "@/lib/admin/orders";
import { getDelhiveryConfig } from "@/lib/integrations/delhivery/client";
import { AdminOrderDetailClient } from "./AdminOrderDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ profile }, { id }] = await Promise.all([
    requireStaffPermission("orders.view"),
    params,
  ]);
  const order = await getAdminOrderById(id);

  if (!order) {
    notFound();
  }

  const delhivery = getDelhiveryConfig();

  return (
    <AdminOrderDetailClient
      order={order}
      delhiveryConfigured={delhivery.isConfigured}
      delhiveryMockMode={delhivery.allowMock}
      userRole={profile.role}
    />
  );
}

